/*!
 * mustache.js - Logic-less {{mustache}} templates with JavaScript
 * http://github.com/janl/mustache.js
 */

/*global define: false*/

(function (root, factory) {
  if (typeof exports === "object" && exports) {
    factory(exports); // CommonJS
  } else {
    var mustache = {};
    factory(mustache);
    if (typeof define === "function" && define.amd) {
      define(mustache); // AMD
    } else {
      root.Mustache = mustache; // <script>
    }
  }
}(this, function (mustache) {

  var whiteRe = /\s*/;
  var spaceRe = /\s+/;
  var nonSpaceRe = /\S/;
  var eqRe = /\s*=/;
  var curlyRe = /\s*\}/;
  var tagRe = /#|\^|\/|>|\{|&|=|!/;

  // Workaround for https://issues.apache.org/jira/browse/COUCHDB-577
  // See https://github.com/janl/mustache.js/issues/189
  var RegExp_test = RegExp.prototype.test;
  function testRegExp(re, string) {
    return RegExp_test.call(re, string);
  }

  function isWhitespace(string) {
    return !testRegExp(nonSpaceRe, string);
  }

  var Object_toString = Object.prototype.toString;
  var isArray = Array.isArray || function (object) {
    return Object_toString.call(object) === '[object Array]';
  };

  function isFunction(object) {
    return typeof object === 'function';
  }

  function escapeRegExp(string) {
    return string.replace(/[\-\[\]{}()*+?.,\\\^$|#\s]/g, "\\$&");
  }

  var entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
  };

  function escapeHtml(string) {
    return String(string).replace(/[&<>"'\/]/g, function (s) {
      return entityMap[s];
    });
  }

  function escapeTags(tags) {
    if (!isArray(tags) || tags.length !== 2) {
      throw new Error('Invalid tags: ' + tags);
    }

    return [
      new RegExp(escapeRegExp(tags[0]) + "\\s*"),
      new RegExp("\\s*" + escapeRegExp(tags[1]))
    ];
  }

  /**
   * Breaks up the given `template` string into a tree of tokens. If the `tags`
   * argument is given here it must be an array with two string values: the
   * opening and closing tags used in the template (e.g. [ "<%", "%>" ]). Of
   * course, the default is to use mustaches (i.e. mustache.tags).
   *
   * A token is an array with at least 4 elements. The first element is the
   * mustache symbol that was used inside the tag, e.g. "#" or "&". If the tag
   * did not contain a symbol (i.e. {{myValue}}) this element is "name". For
   * all template text that appears outside a symbol this element is "text".
   *
   * The second element of a token is its "value". For mustache tags this is
   * whatever else was inside the tag besides the opening symbol. For text tokens
   * this is the text itself.
   *
   * The third and fourth elements of the token are the start and end indices
   * in the original template of the token, respectively.
   *
   * Tokens that are the root node of a subtree contain two more elements: an
   * array of tokens in the subtree and the index in the original template at which
   * the closing tag for that section begins.
   */
  function parseTemplate(template, tags) {
    tags = tags || mustache.tags;
    template = template || '';

    if (typeof tags === 'string') {
      tags = tags.split(spaceRe);
    }

    var tagRes = escapeTags(tags);
    var scanner = new Scanner(template);

    var sections = [];     // Stack to hold section tokens
    var tokens = [];       // Buffer to hold the tokens
    var spaces = [];       // Indices of whitespace tokens on the current line
    var hasTag = false;    // Is there a {{tag}} on the current line?
    var nonSpace = false;  // Is there a non-space char on the current line?

    // Strips all whitespace tokens array for the current line
    // if there was a {{#tag}} on it and otherwise only space.
    function stripSpace() {
      if (hasTag && !nonSpace) {
        while (spaces.length) {
          delete tokens[spaces.pop()];
        }
      } else {
        spaces = [];
      }

      hasTag = false;
      nonSpace = false;
    }

    var start, type, value, chr, token, openSection;
    while (!scanner.eos()) {
      start = scanner.pos;

      // Match any text between tags.
      value = scanner.scanUntil(tagRes[0]);
      if (value) {
        for (var i = 0, len = value.length; i < len; ++i) {
          chr = value.charAt(i);

          if (isWhitespace(chr)) {
            spaces.push(tokens.length);
          } else {
            nonSpace = true;
          }

          tokens.push(['text', chr, start, start + 1]);
          start += 1;

          // Check for whitespace on the current line.
          if (chr === '\n') {
            stripSpace();
          }
        }
      }

      // Match the opening tag.
      if (!scanner.scan(tagRes[0])) break;
      hasTag = true;

      // Get the tag type.
      type = scanner.scan(tagRe) || 'name';
      scanner.scan(whiteRe);

      // Get the tag value.
      if (type === '=') {
        value = scanner.scanUntil(eqRe);
        scanner.scan(eqRe);
        scanner.scanUntil(tagRes[1]);
      } else if (type === '{') {
        value = scanner.scanUntil(new RegExp('\\s*' + escapeRegExp('}' + tags[1])));
        scanner.scan(curlyRe);
        scanner.scanUntil(tagRes[1]);
        type = '&';
      } else {
        value = scanner.scanUntil(tagRes[1]);
      }

      // Match the closing tag.
      if (!scanner.scan(tagRes[1])) {
        throw new Error('Unclosed tag at ' + scanner.pos);
      }

      token = [ type, value, start, scanner.pos ];
      tokens.push(token);

      if (type === '#' || type === '^') {
        sections.push(token);
      } else if (type === '/') {
        // Check section nesting.
        openSection = sections.pop();

        if (!openSection) {
          throw new Error('Unopened section "' + value + '" at ' + start);
        }
        if (openSection[1] !== value) {
          throw new Error('Unclosed section "' + openSection[1] + '" at ' + start);
        }
      } else if (type === 'name' || type === '{' || type === '&') {
        nonSpace = true;
      } else if (type === '=') {
        // Set the tags for the next time around.
        tagRes = escapeTags(tags = value.split(spaceRe));
      }
    }

    // Make sure there are no open sections when we're done.
    openSection = sections.pop();
    if (openSection) {
      throw new Error('Unclosed section "' + openSection[1] + '" at ' + scanner.pos);
    }

    return nestTokens(squashTokens(tokens));
  }

  /**
   * Combines the values of consecutive text tokens in the given `tokens` array
   * to a single token.
   */
  function squashTokens(tokens) {
    var squashedTokens = [];

    var token, lastToken;
    for (var i = 0, len = tokens.length; i < len; ++i) {
      token = tokens[i];

      if (token) {
        if (token[0] === 'text' && lastToken && lastToken[0] === 'text') {
          lastToken[1] += token[1];
          lastToken[3] = token[3];
        } else {
          squashedTokens.push(token);
          lastToken = token;
        }
      }
    }

    return squashedTokens;
  }

  /**
   * Forms the given array of `tokens` into a nested tree structure where
   * tokens that represent a section have two additional items: 1) an array of
   * all tokens that appear in that section and 2) the index in the original
   * template that represents the end of that section.
   */
  function nestTokens(tokens) {
    var nestedTokens = [];
    var collector = nestedTokens;
    var sections = [];

    var token, section;
    for (var i = 0, len = tokens.length; i < len; ++i) {
      token = tokens[i];

      switch (token[0]) {
      case '#':
      case '^':
        collector.push(token);
        sections.push(token);
        collector = token[4] = [];
        break;
      case '/':
        section = sections.pop();
        section[5] = token[2];
        collector = sections.length > 0 ? sections[sections.length - 1][4] : nestedTokens;
        break;
      default:
        collector.push(token);
      }
    }

    return nestedTokens;
  }

  /**
   * A simple string scanner that is used by the template parser to find
   * tokens in template strings.
   */
  function Scanner(string) {
    this.string = string;
    this.tail = string;
    this.pos = 0;
  }

  /**
   * Returns `true` if the tail is empty (end of string).
   */
  Scanner.prototype.eos = function () {
    return this.tail === "";
  };

  /**
   * Tries to match the given regular expression at the current position.
   * Returns the matched text if it can match, the empty string otherwise.
   */
  Scanner.prototype.scan = function (re) {
    var match = this.tail.match(re);

    if (match && match.index === 0) {
      var string = match[0];
      this.tail = this.tail.substring(string.length);
      this.pos += string.length;
      return string;
    }

    return "";
  };

  /**
   * Skips all text until the given regular expression can be matched. Returns
   * the skipped string, which is the entire tail if no match can be made.
   */
  Scanner.prototype.scanUntil = function (re) {
    var index = this.tail.search(re), match;

    switch (index) {
    case -1:
      match = this.tail;
      this.tail = "";
      break;
    case 0:
      match = "";
      break;
    default:
      match = this.tail.substring(0, index);
      this.tail = this.tail.substring(index);
    }

    this.pos += match.length;

    return match;
  };

  /**
   * Represents a rendering context by wrapping a view object and
   * maintaining a reference to the parent context.
   */
  function Context(view, parentContext) {
    this.view = view == null ? {} : view;
    this.cache = { '.': this.view };
    this.parent = parentContext;
  }

  /**
   * Creates a new context using the given view with this context
   * as the parent.
   */
  Context.prototype.push = function (view) {
    return new Context(view, this);
  };

  /**
   * Returns the value of the given name in this context, traversing
   * up the context hierarchy if the value is absent in this context's view.
   */
  Context.prototype.lookup = function (name) {
    var value;
    if (name in this.cache) {
      value = this.cache[name];
    } else {
      var context = this;

      while (context) {
        if (name.indexOf('.') > 0) {
          value = context.view;

          var names = name.split('.'), i = 0;
          while (value != null && i < names.length) {
            value = value[names[i++]];
          }
        } else {
          value = context.view[name];
        }

        if (value != null) break;

        context = context.parent;
      }

      this.cache[name] = value;
    }

    if (isFunction(value)) {
      value = value.call(this.view);
    }

    return value;
  };

  /**
   * A Writer knows how to take a stream of tokens and render them to a
   * string, given a context. It also maintains a cache of templates to
   * avoid the need to parse the same template twice.
   */
  function Writer() {
    this.cache = {};
  }

  /**
   * Clears all cached templates in this writer.
   */
  Writer.prototype.clearCache = function () {
    this.cache = {};
  };

  /**
   * Parses and caches the given `template` and returns the array of tokens
   * that is generated from the parse.
   */
  Writer.prototype.parse = function (template, tags) {
    var cache = this.cache;
    var tokens = cache[template];

    if (tokens == null) {
      tokens = cache[template] = parseTemplate(template, tags);
    }

    return tokens;
  };

  /**
   * High-level method that is used to render the given `template` with
   * the given `view`.
   *
   * The optional `partials` argument may be an object that contains the
   * names and templates of partials that are used in the template. It may
   * also be a function that is used to load partial templates on the fly
   * that takes a single argument: the name of the partial.
   */
  Writer.prototype.render = function (template, view, partials) {
    var tokens = this.parse(template);
    var context = (view instanceof Context) ? view : new Context(view);
    return this.renderTokens(tokens, context, partials, template);
  };

  /**
   * Low-level method that renders the given array of `tokens` using
   * the given `context` and `partials`.
   *
   * Note: The `originalTemplate` is only ever used to extract the portion
   * of the original template that was contained in a higher-order section.
   * If the template doesn't use higher-order sections, this argument may
   * be omitted.
   */
  Writer.prototype.renderTokens = function (tokens, context, partials, originalTemplate) {
    var buffer = '';

    // This function is used to render an arbitrary template
    // in the current context by higher-order sections.
    var self = this;
    function subRender(template) {
      return self.render(template, context, partials);
    }

    var token, value;
    for (var i = 0, len = tokens.length; i < len; ++i) {
      token = tokens[i];

      switch (token[0]) {
      case '#':
        value = context.lookup(token[1]);
        if (!value) continue;

        if (isArray(value)) {
          for (var j = 0, jlen = value.length; j < jlen; ++j) {
            buffer += this.renderTokens(token[4], context.push(value[j]), partials, originalTemplate);
          }
        } else if (typeof value === 'object' || typeof value === 'string') {
          buffer += this.renderTokens(token[4], context.push(value), partials, originalTemplate);
        } else if (isFunction(value)) {
          if (typeof originalTemplate !== 'string') {
            throw new Error('Cannot use higher-order sections without the original template');
          }

          // Extract the portion of the original template that the section contains.
          value = value.call(context.view, originalTemplate.slice(token[3], token[5]), subRender);

          if (value != null) buffer += value;
        } else {
          buffer += this.renderTokens(token[4], context, partials, originalTemplate);
        }

        break;
      case '^':
        value = context.lookup(token[1]);

        // Use JavaScript's definition of falsy. Include empty arrays.
        // See https://github.com/janl/mustache.js/issues/186
        if (!value || (isArray(value) && value.length === 0)) {
          buffer += this.renderTokens(token[4], context, partials, originalTemplate);
        }

        break;
      case '>':
        if (!partials) continue;
        value = isFunction(partials) ? partials(token[1]) : partials[token[1]];
        if (value != null) buffer += this.renderTokens(this.parse(value), context, partials, value);
        break;
      case '&':
        value = context.lookup(token[1]);
        if (value != null) buffer += value;
        break;
      case 'name':
        value = context.lookup(token[1]);
        if (value != null) buffer += mustache.escape(value);
        break;
      case 'text':
        buffer += token[1];
        break;
      }
    }

    return buffer;
  };

  mustache.name = "mustache.js";
  mustache.version = "0.8.1";
  mustache.tags = [ "{{", "}}" ];

  // All high-level mustache.* functions use this writer.
  var defaultWriter = new Writer();

  /**
   * Clears all cached templates in the default writer.
   */
  mustache.clearCache = function () {
    return defaultWriter.clearCache();
  };

  /**
   * Parses and caches the given template in the default writer and returns the
   * array of tokens it contains. Doing this ahead of time avoids the need to
   * parse templates on the fly as they are rendered.
   */
  mustache.parse = function (template, tags) {
    return defaultWriter.parse(template, tags);
  };

  /**
   * Renders the `template` with the given `view` and `partials` using the
   * default writer.
   */
  mustache.render = function (template, view, partials) {
    return defaultWriter.render(template, view, partials);
  };

  // This is here for backwards compatibility with 0.4.x.
  mustache.to_html = function (template, view, partials, send) {
    var result = mustache.render(template, view, partials);

    if (isFunction(send)) {
      send(result);
    } else {
      return result;
    }
  };

  // Export the escaping function so that the user may override it.
  // See https://github.com/janl/mustache.js/issues/244
  mustache.escape = escapeHtml;

  // Export these mainly for testing, but also for advanced usage.
  mustache.Scanner = Scanner;
  mustache.Context = Context;
  mustache.Writer = Writer;

}));;/*!
 * Sizzle CSS Selector Engine v2.1.0-pre
 * http://sizzlejs.com/
 *
 * Copyright 2008, 2014 jQuery Foundation, Inc. and other contributors
 * Released under the MIT license
 * http://jquery.org/license
 *
 * Date: 2014-09-19
 */
(function( window ) {

var i,
  support,
  Expr,
  getText,
  isXML,
  tokenize,
  compile,
  select,
  outermostContext,
  sortInput,
  hasDuplicate,

  // Local document vars
  setDocument,
  document,
  docElem,
  documentIsHTML,
  rbuggyQSA,
  rbuggyMatches,
  matches,
  contains,

  // Instance-specific data
  expando = "sizzle" + 1 * new Date(),
  preferredDoc = window.document,
  dirruns = 0,
  done = 0,
  classCache = createCache(),
  tokenCache = createCache(),
  compilerCache = createCache(),
  sortOrder = function( a, b ) {
    if ( a === b ) {
      hasDuplicate = true;
    }
    return 0;
  },

  // General-purpose constants
  MAX_NEGATIVE = 1 << 31,

  // Instance methods
  hasOwn = ({}).hasOwnProperty,
  arr = [],
  pop = arr.pop,
  push_native = arr.push,
  push = arr.push,
  slice = arr.slice,
  // Use a stripped-down indexOf as it's faster than native
  // http://jsperf.com/thor-indexof-vs-for/5
  indexOf = function( list, elem ) {
    var i = 0,
      len = list.length;
    for ( ; i < len; i++ ) {
      if ( list[i] === elem ) {
        return i;
      }
    }
    return -1;
  },

  booleans = "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",

  // Regular expressions

  // http://www.w3.org/TR/css3-selectors/#whitespace
  whitespace = "[\\x20\\t\\r\\n\\f]",

  // http://www.w3.org/TR/CSS21/syndata.html#value-def-identifier
  identifier = "(?:\\\\.|[\\w-]|[^\\x00-\\xa0])+",

  // Attribute selectors: http://www.w3.org/TR/selectors/#attribute-selectors
  attributes = "\\[" + whitespace + "*(" + identifier + ")(?:" + whitespace +
    // Operator (capture 2)
    "*([*^$|!~]?=)" + whitespace +
    // "Attribute values must be CSS identifiers [capture 5] or strings [capture 3 or capture 4]"
    "*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" + identifier + "))|)" + whitespace +
    "*\\]",

  pseudos = ":(" + identifier + ")(?:\\((" +
    // To reduce the number of selectors needing tokenize in the preFilter, prefer arguments:
    // 1. quoted (capture 3; capture 4 or capture 5)
    "('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|" +
    // 2. simple (capture 6)
    "((?:\\\\.|[^\\\\()[\\]]|" + attributes + ")*)|" +
    // 3. anything else (capture 2)
    ".*" +
    ")\\)|)",

  // Leading and non-escaped trailing whitespace, capturing some non-whitespace characters preceding the latter
  rwhitespace = new RegExp( whitespace + "+", "g" ),
  rtrim = new RegExp( "^" + whitespace + "+|((?:^|[^\\\\])(?:\\\\.)*)" + whitespace + "+$", "g" ),

  rcomma = new RegExp( "^" + whitespace + "*," + whitespace + "*" ),
  rcombinators = new RegExp( "^" + whitespace + "*([>+~]|" + whitespace + ")" + whitespace + "*" ),

  rattributeQuotes = new RegExp( "=" + whitespace + "*([^\\]'\"]*?)" + whitespace + "*\\]", "g" ),

  rpseudo = new RegExp( pseudos ),
  ridentifier = new RegExp( "^" + identifier + "$" ),

  matchExpr = {
    "ID": new RegExp( "^#(" + identifier + ")" ),
    "CLASS": new RegExp( "^\\.(" + identifier + ")" ),
    "TAG": new RegExp( "^(" + identifier + "|[*])" ),
    "ATTR": new RegExp( "^" + attributes ),
    "PSEUDO": new RegExp( "^" + pseudos ),
    "CHILD": new RegExp( "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" + whitespace +
      "*(even|odd|(([+-]|)(\\d*)n|)" + whitespace + "*(?:([+-]|)" + whitespace +
      "*(\\d+)|))" + whitespace + "*\\)|)", "i" ),
    "bool": new RegExp( "^(?:" + booleans + ")$", "i" ),
    // For use in libraries implementing .is()
    // We use this for POS matching in `select`
    "needsContext": new RegExp( "^" + whitespace + "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
      whitespace + "*((?:-\\d)?\\d*)" + whitespace + "*\\)|)(?=[^-]|$)", "i" )
  },

  rinputs = /^(?:input|select|textarea|button)$/i,
  rheader = /^h\d$/i,

  rnative = /^[^{]+\{\s*\[native \w/,

  // Easily-parseable/retrievable ID or TAG or CLASS selectors
  rquickExpr = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,

  rsibling = /[+~]/,
  rescape = /'|\\/g,

  // CSS escapes http://www.w3.org/TR/CSS21/syndata.html#escaped-characters
  runescape = new RegExp( "\\\\([\\da-f]{1,6}" + whitespace + "?|(" + whitespace + ")|.)", "ig" ),
  funescape = function( _, escaped, escapedWhitespace ) {
    var high = "0x" + escaped - 0x10000;
    // NaN means non-codepoint
    // Support: Firefox<24
    // Workaround erroneous numeric interpretation of +"0x"
    return high !== high || escapedWhitespace ?
      escaped :
      high < 0 ?
        // BMP codepoint
        String.fromCharCode( high + 0x10000 ) :
        // Supplemental Plane codepoint (surrogate pair)
        String.fromCharCode( high >> 10 | 0xD800, high & 0x3FF | 0xDC00 );
  };

// Optimize for push.apply( _, NodeList )
try {
  push.apply(
    (arr = slice.call( preferredDoc.childNodes )),
    preferredDoc.childNodes
  );
  // Support: Android<4.0
  // Detect silently failing push.apply
  arr[ preferredDoc.childNodes.length ].nodeType;
} catch ( e ) {
  push = { apply: arr.length ?

    // Leverage slice if possible
    function( target, els ) {
      push_native.apply( target, slice.call(els) );
    } :

    // Support: IE<9
    // Otherwise append directly
    function( target, els ) {
      var j = target.length,
        i = 0;
      // Can't trust NodeList.length
      while ( (target[j++] = els[i++]) ) {}
      target.length = j - 1;
    }
  };
}

function Sizzle( selector, context, results, seed ) {
  var match, elem, m, nodeType,
    // QSA vars
    i, groups, old, nid, newContext, newSelector;

  if ( ( context ? context.ownerDocument || context : preferredDoc ) !== document ) {
    setDocument( context );
  }

  context = context || document;
  results = results || [];
  nodeType = context.nodeType;

  if ( typeof selector !== "string" || !selector ||
    nodeType !== 1 && nodeType !== 9 && nodeType !== 11 ) {

    return results;
  }

  if ( !seed && documentIsHTML ) {

    // Try to shortcut find operations when possible (e.g., not under DocumentFragment)
    if ( nodeType !== 11 && (match = rquickExpr.exec( selector )) ) {
      // Speed-up: Sizzle("#ID")
      if ( (m = match[1]) ) {
        if ( nodeType === 9 ) {
          elem = context.getElementById( m );
          // Check parentNode to catch when Blackberry 4.6 returns
          // nodes that are no longer in the document (jQuery #6963)
          if ( elem && elem.parentNode ) {
            // Handle the case where IE, Opera, and Webkit return items
            // by name instead of ID
            if ( elem.id === m ) {
              results.push( elem );
              return results;
            }
          } else {
            return results;
          }
        } else {
          // Context is not a document
          if ( context.ownerDocument && (elem = context.ownerDocument.getElementById( m )) &&
            contains( context, elem ) && elem.id === m ) {
            results.push( elem );
            return results;
          }
        }

      // Speed-up: Sizzle("TAG")
      } else if ( match[2] ) {
        push.apply( results, context.getElementsByTagName( selector ) );
        return results;

      // Speed-up: Sizzle(".CLASS")
      } else if ( (m = match[3]) && support.getElementsByClassName ) {
        push.apply( results, context.getElementsByClassName( m ) );
        return results;
      }
    }

    // QSA path
    if ( support.qsa && (!rbuggyQSA || !rbuggyQSA.test( selector )) ) {
      nid = old = expando;
      newContext = context;
      newSelector = nodeType !== 1 && selector;

      // qSA works strangely on Element-rooted queries
      // We can work around this by specifying an extra ID on the root
      // and working up from there (Thanks to Andrew Dupont for the technique)
      // IE 8 doesn't work on object elements
      if ( nodeType === 1 && context.nodeName.toLowerCase() !== "object" ) {
        groups = tokenize( selector );

        if ( (old = context.getAttribute("id")) ) {
          nid = old.replace( rescape, "\\$&" );
        } else {
          context.setAttribute( "id", nid );
        }
        nid = "[id='" + nid + "'] ";

        i = groups.length;
        while ( i-- ) {
          groups[i] = nid + toSelector( groups[i] );
        }
        newContext = rsibling.test( selector ) && testContext( context.parentNode ) || context;
        newSelector = groups.join(",");
      }

      if ( newSelector ) {
        try {
          push.apply( results,
            newContext.querySelectorAll( newSelector )
          );
          return results;
        } catch(qsaError) {
        } finally {
          if ( !old ) {
            context.removeAttribute("id");
          }
        }
      }
    }
  }

  // All others
  return select( selector.replace( rtrim, "$1" ), context, results, seed );
}

/**
 * Create key-value caches of limited size
 * @returns {Function(string, Object)} Returns the Object data after storing it on itself with
 *  property name the (space-suffixed) string and (if the cache is larger than Expr.cacheLength)
 *  deleting the oldest entry
 */
function createCache() {
  var keys = [];

  function cache( key, value ) {
    // Use (key + " ") to avoid collision with native prototype properties (see Issue #157)
    if ( keys.push( key + " " ) > Expr.cacheLength ) {
      // Only keep the most recent entries
      delete cache[ keys.shift() ];
    }
    return (cache[ key + " " ] = value);
  }
  return cache;
}

/**
 * Mark a function for special use by Sizzle
 * @param {Function} fn The function to mark
 */
function markFunction( fn ) {
  fn[ expando ] = true;
  return fn;
}

/**
 * Support testing using an element
 * @param {Function} fn Passed the created div and expects a boolean result
 */
function assert( fn ) {
  var div = document.createElement("div");

  try {
    return !!fn( div );
  } catch (e) {
    return false;
  } finally {
    // Remove from its parent by default
    if ( div.parentNode ) {
      div.parentNode.removeChild( div );
    }
    // release memory in IE
    div = null;
  }
}

/**
 * Adds the same handler for all of the specified attrs
 * @param {String} attrs Pipe-separated list of attributes
 * @param {Function} handler The method that will be applied
 */
function addHandle( attrs, handler ) {
  var arr = attrs.split("|"),
    i = attrs.length;

  while ( i-- ) {
    Expr.attrHandle[ arr[i] ] = handler;
  }
}

/**
 * Checks document order of two siblings
 * @param {Element} a
 * @param {Element} b
 * @returns {Number} Returns less than 0 if a precedes b, greater than 0 if a follows b
 */
function siblingCheck( a, b ) {
  var cur = b && a,
    diff = cur && a.nodeType === 1 && b.nodeType === 1 &&
      ( ~b.sourceIndex || MAX_NEGATIVE ) -
      ( ~a.sourceIndex || MAX_NEGATIVE );

  // Use IE sourceIndex if available on both nodes
  if ( diff ) {
    return diff;
  }

  // Check if b follows a
  if ( cur ) {
    while ( (cur = cur.nextSibling) ) {
      if ( cur === b ) {
        return -1;
      }
    }
  }

  return a ? 1 : -1;
}

/**
 * Returns a function to use in pseudos for input types
 * @param {String} type
 */
function createInputPseudo( type ) {
  return function( elem ) {
    var name = elem.nodeName.toLowerCase();
    return name === "input" && elem.type === type;
  };
}

/**
 * Returns a function to use in pseudos for buttons
 * @param {String} type
 */
function createButtonPseudo( type ) {
  return function( elem ) {
    var name = elem.nodeName.toLowerCase();
    return (name === "input" || name === "button") && elem.type === type;
  };
}

/**
 * Returns a function to use in pseudos for positionals
 * @param {Function} fn
 */
function createPositionalPseudo( fn ) {
  return markFunction(function( argument ) {
    argument = +argument;
    return markFunction(function( seed, matches ) {
      var j,
        matchIndexes = fn( [], seed.length, argument ),
        i = matchIndexes.length;

      // Match elements found at the specified indexes
      while ( i-- ) {
        if ( seed[ (j = matchIndexes[i]) ] ) {
          seed[j] = !(matches[j] = seed[j]);
        }
      }
    });
  });
}

/**
 * Checks a node for validity as a Sizzle context
 * @param {Element|Object=} context
 * @returns {Element|Object|Boolean} The input node if acceptable, otherwise a falsy value
 */
function testContext( context ) {
  return context && typeof context.getElementsByTagName !== "undefined" && context;
}

// Expose support vars for convenience
support = Sizzle.support = {};

/**
 * Detects XML nodes
 * @param {Element|Object} elem An element or a document
 * @returns {Boolean} True iff elem is a non-HTML XML node
 */
isXML = Sizzle.isXML = function( elem ) {
  // documentElement is verified for cases where it doesn't yet exist
  // (such as loading iframes in IE - #4833)
  var documentElement = elem && (elem.ownerDocument || elem).documentElement;
  return documentElement ? documentElement.nodeName !== "HTML" : false;
};

/**
 * Sets document-related variables once based on the current document
 * @param {Element|Object} [doc] An element or document object to use to set the document
 * @returns {Object} Returns the current document
 */
setDocument = Sizzle.setDocument = function( node ) {
  var hasCompare,
    doc = node ? node.ownerDocument || node : preferredDoc,
    parent = doc.defaultView;

  // If no document and documentElement is available, return
  if ( doc === document || doc.nodeType !== 9 || !doc.documentElement ) {
    return document;
  }

  // Set our document
  document = doc;
  docElem = doc.documentElement;

  // Support tests
  documentIsHTML = !isXML( doc );

  // Support: IE>8
  // If iframe document is assigned to "document" variable and if iframe has been reloaded,
  // IE will throw "permission denied" error when accessing "document" variable, see jQuery #13936
  // IE6-8 do not support the defaultView property so parent will be undefined
  if ( parent && parent !== parent.top ) {
    // IE11 does not have attachEvent, so all must suffer
    if ( parent.addEventListener ) {
      parent.addEventListener( "unload", function() {
        setDocument();
      }, false );
    } else if ( parent.attachEvent ) {
      parent.attachEvent( "onunload", function() {
        setDocument();
      });
    }
  }

  /* Attributes
  ---------------------------------------------------------------------- */

  // Support: IE<8
  // Verify that getAttribute really returns attributes and not properties (excepting IE8 booleans)
  support.attributes = assert(function( div ) {
    div.className = "i";
    return !div.getAttribute("className");
  });

  /* getElement(s)By*
  ---------------------------------------------------------------------- */

  // Check if getElementsByTagName("*") returns only elements
  support.getElementsByTagName = assert(function( div ) {
    div.appendChild( doc.createComment("") );
    return !div.getElementsByTagName("*").length;
  });

  // Support: IE<9
  support.getElementsByClassName = rnative.test( doc.getElementsByClassName );

  // Support: IE<10
  // Check if getElementById returns elements by name
  // The broken getElementById methods don't pick up programatically-set names,
  // so use a roundabout getElementsByName test
  support.getById = assert(function( div ) {
    docElem.appendChild( div ).id = expando;
    return !doc.getElementsByName || !doc.getElementsByName( expando ).length;
  });

  // ID find and filter
  if ( support.getById ) {
    Expr.find["ID"] = function( id, context ) {
      if ( typeof context.getElementById !== "undefined" && documentIsHTML ) {
        var m = context.getElementById( id );
        // Check parentNode to catch when Blackberry 4.6 returns
        // nodes that are no longer in the document #6963
        return m && m.parentNode ? [ m ] : [];
      }
    };
    Expr.filter["ID"] = function( id ) {
      var attrId = id.replace( runescape, funescape );
      return function( elem ) {
        return elem.getAttribute("id") === attrId;
      };
    };
  } else {
    // Support: IE6/7
    // getElementById is not reliable as a find shortcut
    delete Expr.find["ID"];

    Expr.filter["ID"] =  function( id ) {
      var attrId = id.replace( runescape, funescape );
      return function( elem ) {
        var node = typeof elem.getAttributeNode !== "undefined" && elem.getAttributeNode("id");
        return node && node.value === attrId;
      };
    };
  }

  // Tag
  Expr.find["TAG"] = support.getElementsByTagName ?
    function( tag, context ) {
      if ( typeof context.getElementsByTagName !== "undefined" ) {
        return context.getElementsByTagName( tag );

      // DocumentFragment nodes don't have gEBTN
      } else if ( support.qsa ) {
        return context.querySelectorAll( tag );
      }
    } :

    function( tag, context ) {
      var elem,
        tmp = [],
        i = 0,
        // By happy coincidence, a (broken) gEBTN appears on DocumentFragment nodes too
        results = context.getElementsByTagName( tag );

      // Filter out possible comments
      if ( tag === "*" ) {
        while ( (elem = results[i++]) ) {
          if ( elem.nodeType === 1 ) {
            tmp.push( elem );
          }
        }

        return tmp;
      }
      return results;
    };

  // Class
  Expr.find["CLASS"] = support.getElementsByClassName && function( className, context ) {
    if ( documentIsHTML ) {
      return context.getElementsByClassName( className );
    }
  };

  /* QSA/matchesSelector
  ---------------------------------------------------------------------- */

  // QSA and matchesSelector support

  // matchesSelector(:active) reports false when true (IE9/Opera 11.5)
  rbuggyMatches = [];

  // qSa(:focus) reports false when true (Chrome 21)
  // We allow this because of a bug in IE8/9 that throws an error
  // whenever `document.activeElement` is accessed on an iframe
  // So, we allow :focus to pass through QSA all the time to avoid the IE error
  // See http://bugs.jquery.com/ticket/13378
  rbuggyQSA = [];

  if ( (support.qsa = rnative.test( doc.querySelectorAll )) ) {
    // Build QSA regex
    // Regex strategy adopted from Diego Perini
    assert(function( div ) {
      // Select is set to empty string on purpose
      // This is to test IE's treatment of not explicitly
      // setting a boolean content attribute,
      // since its presence should be enough
      // http://bugs.jquery.com/ticket/12359
      div.innerHTML = "<select msallowcapture=''>" +
        "<option id='d\f]' selected=''></option></select>";

      // Support: IE8, Opera 11-12.16
      // Nothing should be selected when empty strings follow ^= or $= or *=
      // The test attribute must be unknown in Opera but "safe" for WinRT
      // http://msdn.microsoft.com/en-us/library/ie/hh465388.aspx#attribute_section
      if ( div.querySelectorAll("[msallowcapture^='']").length ) {
        rbuggyQSA.push( "[*^$]=" + whitespace + "*(?:''|\"\")" );
      }

      // Support: IE8
      // Boolean attributes and "value" are not treated correctly
      if ( !div.querySelectorAll("[selected]").length ) {
        rbuggyQSA.push( "\\[" + whitespace + "*(?:value|" + booleans + ")" );
      }

      // Support: Chrome<29, Android<4.2+, Safari<7.0+, iOS<7.0+, PhantomJS<1.9.7+
      if ( !div.querySelectorAll("[id~=d]").length ) {
        rbuggyQSA.push("~=");
      }

      // Webkit/Opera - :checked should return selected option elements
      // http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
      // IE8 throws error here and will not see later tests
      if ( !div.querySelectorAll(":checked").length ) {
        rbuggyQSA.push(":checked");
      }
    });

    assert(function( div ) {
      // Support: Windows 8 Native Apps
      // The type and name attributes are restricted during .innerHTML assignment
      var input = doc.createElement("input");
      input.setAttribute( "type", "hidden" );
      div.appendChild( input ).setAttribute( "name", "D" );

      // Support: IE8
      // Enforce case-sensitivity of name attribute
      if ( div.querySelectorAll("[name=d]").length ) {
        rbuggyQSA.push( "name" + whitespace + "*[*^$|!~]?=" );
      }

      // FF 3.5 - :enabled/:disabled and hidden elements (hidden elements are still enabled)
      // IE8 throws error here and will not see later tests
      if ( !div.querySelectorAll(":enabled").length ) {
        rbuggyQSA.push( ":enabled", ":disabled" );
      }

      // Opera 10-11 does not throw on post-comma invalid pseudos
      div.querySelectorAll("*,:x");
      rbuggyQSA.push(",.*:");
    });
  }

  if ( (support.matchesSelector = rnative.test( (matches = docElem.matches ||
    docElem.webkitMatchesSelector ||
    docElem.mozMatchesSelector ||
    docElem.oMatchesSelector ||
    docElem.msMatchesSelector) )) ) {

    assert(function( div ) {
      // Check to see if it's possible to do matchesSelector
      // on a disconnected node (IE 9)
      support.disconnectedMatch = matches.call( div, "div" );

      // This should fail with an exception
      // Gecko does not error, returns false instead
      matches.call( div, "[s!='']:x" );
      rbuggyMatches.push( "!=", pseudos );
    });
  }

  rbuggyQSA = rbuggyQSA.length && new RegExp( rbuggyQSA.join("|") );
  rbuggyMatches = rbuggyMatches.length && new RegExp( rbuggyMatches.join("|") );

  /* Contains
  ---------------------------------------------------------------------- */
  hasCompare = rnative.test( docElem.compareDocumentPosition );

  // Element contains another
  // Purposefully does not implement inclusive descendent
  // As in, an element does not contain itself
  contains = hasCompare || rnative.test( docElem.contains ) ?
    function( a, b ) {
      var adown = a.nodeType === 9 ? a.documentElement : a,
        bup = b && b.parentNode;
      return a === bup || !!( bup && bup.nodeType === 1 && (
        adown.contains ?
          adown.contains( bup ) :
          a.compareDocumentPosition && a.compareDocumentPosition( bup ) & 16
      ));
    } :
    function( a, b ) {
      if ( b ) {
        while ( (b = b.parentNode) ) {
          if ( b === a ) {
            return true;
          }
        }
      }
      return false;
    };

  /* Sorting
  ---------------------------------------------------------------------- */

  // Document order sorting
  sortOrder = hasCompare ?
  function( a, b ) {

    // Flag for duplicate removal
    if ( a === b ) {
      hasDuplicate = true;
      return 0;
    }

    // Sort on method existence if only one input has compareDocumentPosition
    var compare = !a.compareDocumentPosition - !b.compareDocumentPosition;
    if ( compare ) {
      return compare;
    }

    // Calculate position if both inputs belong to the same document
    compare = ( a.ownerDocument || a ) === ( b.ownerDocument || b ) ?
      a.compareDocumentPosition( b ) :

      // Otherwise we know they are disconnected
      1;

    // Disconnected nodes
    if ( compare & 1 ||
      (!support.sortDetached && b.compareDocumentPosition( a ) === compare) ) {

      // Choose the first element that is related to our preferred document
      if ( a === doc || a.ownerDocument === preferredDoc && contains(preferredDoc, a) ) {
        return -1;
      }
      if ( b === doc || b.ownerDocument === preferredDoc && contains(preferredDoc, b) ) {
        return 1;
      }

      // Maintain original order
      return sortInput ?
        ( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
        0;
    }

    return compare & 4 ? -1 : 1;
  } :
  function( a, b ) {
    // Exit early if the nodes are identical
    if ( a === b ) {
      hasDuplicate = true;
      return 0;
    }

    var cur,
      i = 0,
      aup = a.parentNode,
      bup = b.parentNode,
      ap = [ a ],
      bp = [ b ];

    // Parentless nodes are either documents or disconnected
    if ( !aup || !bup ) {
      return a === doc ? -1 :
        b === doc ? 1 :
        aup ? -1 :
        bup ? 1 :
        sortInput ?
        ( indexOf( sortInput, a ) - indexOf( sortInput, b ) ) :
        0;

    // If the nodes are siblings, we can do a quick check
    } else if ( aup === bup ) {
      return siblingCheck( a, b );
    }

    // Otherwise we need full lists of their ancestors for comparison
    cur = a;
    while ( (cur = cur.parentNode) ) {
      ap.unshift( cur );
    }
    cur = b;
    while ( (cur = cur.parentNode) ) {
      bp.unshift( cur );
    }

    // Walk down the tree looking for a discrepancy
    while ( ap[i] === bp[i] ) {
      i++;
    }

    return i ?
      // Do a sibling check if the nodes have a common ancestor
      siblingCheck( ap[i], bp[i] ) :

      // Otherwise nodes in our document sort first
      ap[i] === preferredDoc ? -1 :
      bp[i] === preferredDoc ? 1 :
      0;
  };

  return doc;
};

Sizzle.matches = function( expr, elements ) {
  return Sizzle( expr, null, null, elements );
};

Sizzle.matchesSelector = function( elem, expr ) {
  // Set document vars if needed
  if ( ( elem.ownerDocument || elem ) !== document ) {
    setDocument( elem );
  }

  // Make sure that attribute selectors are quoted
  expr = expr.replace( rattributeQuotes, "='$1']" );

  if ( support.matchesSelector && documentIsHTML &&
    ( !rbuggyMatches || !rbuggyMatches.test( expr ) ) &&
    ( !rbuggyQSA     || !rbuggyQSA.test( expr ) ) ) {

    try {
      var ret = matches.call( elem, expr );

      // IE 9's matchesSelector returns false on disconnected nodes
      if ( ret || support.disconnectedMatch ||
          // As well, disconnected nodes are said to be in a document
          // fragment in IE 9
          elem.document && elem.document.nodeType !== 11 ) {
        return ret;
      }
    } catch(e) {}
  }

  return Sizzle( expr, document, null, [ elem ] ).length > 0;
};

Sizzle.contains = function( context, elem ) {
  // Set document vars if needed
  if ( ( context.ownerDocument || context ) !== document ) {
    setDocument( context );
  }
  return contains( context, elem );
};

Sizzle.attr = function( elem, name ) {
  // Set document vars if needed
  if ( ( elem.ownerDocument || elem ) !== document ) {
    setDocument( elem );
  }

  var fn = Expr.attrHandle[ name.toLowerCase() ],
    // Don't get fooled by Object.prototype properties (jQuery #13807)
    val = fn && hasOwn.call( Expr.attrHandle, name.toLowerCase() ) ?
      fn( elem, name, !documentIsHTML ) :
      undefined;

  return val !== undefined ?
    val :
    support.attributes || !documentIsHTML ?
      elem.getAttribute( name ) :
      (val = elem.getAttributeNode(name)) && val.specified ?
        val.value :
        null;
};

Sizzle.error = function( msg ) {
  throw new Error( "Syntax error, unrecognized expression: " + msg );
};

/**
 * Document sorting and removing duplicates
 * @param {ArrayLike} results
 */
Sizzle.uniqueSort = function( results ) {
  var elem,
    duplicates = [],
    j = 0,
    i = 0;

  // Unless we *know* we can detect duplicates, assume their presence
  hasDuplicate = !support.detectDuplicates;
  sortInput = !support.sortStable && results.slice( 0 );
  results.sort( sortOrder );

  if ( hasDuplicate ) {
    while ( (elem = results[i++]) ) {
      if ( elem === results[ i ] ) {
        j = duplicates.push( i );
      }
    }
    while ( j-- ) {
      results.splice( duplicates[ j ], 1 );
    }
  }

  // Clear input after sorting to release objects
  // See https://github.com/jquery/sizzle/pull/225
  sortInput = null;

  return results;
};

/**
 * Utility function for retrieving the text value of an array of DOM nodes
 * @param {Array|Element} elem
 */
getText = Sizzle.getText = function( elem ) {
  var node,
    ret = "",
    i = 0,
    nodeType = elem.nodeType;

  if ( !nodeType ) {
    // If no nodeType, this is expected to be an array
    while ( (node = elem[i++]) ) {
      // Do not traverse comment nodes
      ret += getText( node );
    }
  } else if ( nodeType === 1 || nodeType === 9 || nodeType === 11 ) {
    // Use textContent for elements
    // innerText usage removed for consistency of new lines (jQuery #11153)
    if ( typeof elem.textContent === "string" ) {
      return elem.textContent;
    } else {
      // Traverse its children
      for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
        ret += getText( elem );
      }
    }
  } else if ( nodeType === 3 || nodeType === 4 ) {
    return elem.nodeValue;
  }
  // Do not include comment or processing instruction nodes

  return ret;
};

Expr = Sizzle.selectors = {

  // Can be adjusted by the user
  cacheLength: 50,

  createPseudo: markFunction,

  match: matchExpr,

  attrHandle: {},

  find: {},

  relative: {
    ">": { dir: "parentNode", first: true },
    " ": { dir: "parentNode" },
    "+": { dir: "previousSibling", first: true },
    "~": { dir: "previousSibling" }
  },

  preFilter: {
    "ATTR": function( match ) {
      match[1] = match[1].replace( runescape, funescape );

      // Move the given value to match[3] whether quoted or unquoted
      match[3] = ( match[3] || match[4] || match[5] || "" ).replace( runescape, funescape );

      if ( match[2] === "~=" ) {
        match[3] = " " + match[3] + " ";
      }

      return match.slice( 0, 4 );
    },

    "CHILD": function( match ) {
      /* matches from matchExpr["CHILD"]
        1 type (only|nth|...)
        2 what (child|of-type)
        3 argument (even|odd|\d*|\d*n([+-]\d+)?|...)
        4 xn-component of xn+y argument ([+-]?\d*n|)
        5 sign of xn-component
        6 x of xn-component
        7 sign of y-component
        8 y of y-component
      */
      match[1] = match[1].toLowerCase();

      if ( match[1].slice( 0, 3 ) === "nth" ) {
        // nth-* requires argument
        if ( !match[3] ) {
          Sizzle.error( match[0] );
        }

        // numeric x and y parameters for Expr.filter.CHILD
        // remember that false/true cast respectively to 0/1
        match[4] = +( match[4] ? match[5] + (match[6] || 1) : 2 * ( match[3] === "even" || match[3] === "odd" ) );
        match[5] = +( ( match[7] + match[8] ) || match[3] === "odd" );

      // other types prohibit arguments
      } else if ( match[3] ) {
        Sizzle.error( match[0] );
      }

      return match;
    },

    "PSEUDO": function( match ) {
      var excess,
        unquoted = !match[6] && match[2];

      if ( matchExpr["CHILD"].test( match[0] ) ) {
        return null;
      }

      // Accept quoted arguments as-is
      if ( match[3] ) {
        match[2] = match[4] || match[5] || "";

      // Strip excess characters from unquoted arguments
      } else if ( unquoted && rpseudo.test( unquoted ) &&
        // Get excess from tokenize (recursively)
        (excess = tokenize( unquoted, true )) &&
        // advance to the next closing parenthesis
        (excess = unquoted.indexOf( ")", unquoted.length - excess ) - unquoted.length) ) {

        // excess is a negative index
        match[0] = match[0].slice( 0, excess );
        match[2] = unquoted.slice( 0, excess );
      }

      // Return only captures needed by the pseudo filter method (type and argument)
      return match.slice( 0, 3 );
    }
  },

  filter: {

    "TAG": function( nodeNameSelector ) {
      var nodeName = nodeNameSelector.replace( runescape, funescape ).toLowerCase();
      return nodeNameSelector === "*" ?
        function() { return true; } :
        function( elem ) {
          return elem.nodeName && elem.nodeName.toLowerCase() === nodeName;
        };
    },

    "CLASS": function( className ) {
      var pattern = classCache[ className + " " ];

      return pattern ||
        (pattern = new RegExp( "(^|" + whitespace + ")" + className + "(" + whitespace + "|$)" )) &&
        classCache( className, function( elem ) {
          return pattern.test( typeof elem.className === "string" && elem.className || typeof elem.getAttribute !== "undefined" && elem.getAttribute("class") || "" );
        });
    },

    "ATTR": function( name, operator, check ) {
      return function( elem ) {
        var result = Sizzle.attr( elem, name );

        if ( result == null ) {
          return operator === "!=";
        }
        if ( !operator ) {
          return true;
        }

        result += "";

        return operator === "=" ? result === check :
          operator === "!=" ? result !== check :
          operator === "^=" ? check && result.indexOf( check ) === 0 :
          operator === "*=" ? check && result.indexOf( check ) > -1 :
          operator === "$=" ? check && result.slice( -check.length ) === check :
          operator === "~=" ? ( " " + result.replace( rwhitespace, " " ) + " " ).indexOf( check ) > -1 :
          operator === "|=" ? result === check || result.slice( 0, check.length + 1 ) === check + "-" :
          false;
      };
    },

    "CHILD": function( type, what, argument, first, last ) {
      var simple = type.slice( 0, 3 ) !== "nth",
        forward = type.slice( -4 ) !== "last",
        ofType = what === "of-type";

      return first === 1 && last === 0 ?

        // Shortcut for :nth-*(n)
        function( elem ) {
          return !!elem.parentNode;
        } :

        function( elem, context, xml ) {
          var cache, outerCache, node, diff, nodeIndex, start,
            dir = simple !== forward ? "nextSibling" : "previousSibling",
            parent = elem.parentNode,
            name = ofType && elem.nodeName.toLowerCase(),
            useCache = !xml && !ofType;

          if ( parent ) {

            // :(first|last|only)-(child|of-type)
            if ( simple ) {
              while ( dir ) {
                node = elem;
                while ( (node = node[ dir ]) ) {
                  if ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) {
                    return false;
                  }
                }
                // Reverse direction for :only-* (if we haven't yet done so)
                start = dir = type === "only" && !start && "nextSibling";
              }
              return true;
            }

            start = [ forward ? parent.firstChild : parent.lastChild ];

            // non-xml :nth-child(...) stores cache data on `parent`
            if ( forward && useCache ) {
              // Seek `elem` from a previously-cached index
              outerCache = parent[ expando ] || (parent[ expando ] = {});
              cache = outerCache[ type ] || [];
              nodeIndex = cache[0] === dirruns && cache[1];
              diff = cache[0] === dirruns && cache[2];
              node = nodeIndex && parent.childNodes[ nodeIndex ];

              while ( (node = ++nodeIndex && node && node[ dir ] ||

                // Fallback to seeking `elem` from the start
                (diff = nodeIndex = 0) || start.pop()) ) {

                // When found, cache indexes on `parent` and break
                if ( node.nodeType === 1 && ++diff && node === elem ) {
                  outerCache[ type ] = [ dirruns, nodeIndex, diff ];
                  break;
                }
              }

            // Use previously-cached element index if available
            } else if ( useCache && (cache = (elem[ expando ] || (elem[ expando ] = {}))[ type ]) && cache[0] === dirruns ) {
              diff = cache[1];

            // xml :nth-child(...) or :nth-last-child(...) or :nth(-last)?-of-type(...)
            } else {
              // Use the same loop as above to seek `elem` from the start
              while ( (node = ++nodeIndex && node && node[ dir ] ||
                (diff = nodeIndex = 0) || start.pop()) ) {

                if ( ( ofType ? node.nodeName.toLowerCase() === name : node.nodeType === 1 ) && ++diff ) {
                  // Cache the index of each encountered element
                  if ( useCache ) {
                    (node[ expando ] || (node[ expando ] = {}))[ type ] = [ dirruns, diff ];
                  }

                  if ( node === elem ) {
                    break;
                  }
                }
              }
            }

            // Incorporate the offset, then check against cycle size
            diff -= last;
            return diff === first || ( diff % first === 0 && diff / first >= 0 );
          }
        };
    },

    "PSEUDO": function( pseudo, argument ) {
      // pseudo-class names are case-insensitive
      // http://www.w3.org/TR/selectors/#pseudo-classes
      // Prioritize by case sensitivity in case custom pseudos are added with uppercase letters
      // Remember that setFilters inherits from pseudos
      var args,
        fn = Expr.pseudos[ pseudo ] || Expr.setFilters[ pseudo.toLowerCase() ] ||
          Sizzle.error( "unsupported pseudo: " + pseudo );

      // The user may use createPseudo to indicate that
      // arguments are needed to create the filter function
      // just as Sizzle does
      if ( fn[ expando ] ) {
        return fn( argument );
      }

      // But maintain support for old signatures
      if ( fn.length > 1 ) {
        args = [ pseudo, pseudo, "", argument ];
        return Expr.setFilters.hasOwnProperty( pseudo.toLowerCase() ) ?
          markFunction(function( seed, matches ) {
            var idx,
              matched = fn( seed, argument ),
              i = matched.length;
            while ( i-- ) {
              idx = indexOf( seed, matched[i] );
              seed[ idx ] = !( matches[ idx ] = matched[i] );
            }
          }) :
          function( elem ) {
            return fn( elem, 0, args );
          };
      }

      return fn;
    }
  },

  pseudos: {
    // Potentially complex pseudos
    "not": markFunction(function( selector ) {
      // Trim the selector passed to compile
      // to avoid treating leading and trailing
      // spaces as combinators
      var input = [],
        results = [],
        matcher = compile( selector.replace( rtrim, "$1" ) );

      return matcher[ expando ] ?
        markFunction(function( seed, matches, context, xml ) {
          var elem,
            unmatched = matcher( seed, null, xml, [] ),
            i = seed.length;

          // Match elements unmatched by `matcher`
          while ( i-- ) {
            if ( (elem = unmatched[i]) ) {
              seed[i] = !(matches[i] = elem);
            }
          }
        }) :
        function( elem, context, xml ) {
          input[0] = elem;
          matcher( input, null, xml, results );
          return !results.pop();
        };
    }),

    "has": markFunction(function( selector ) {
      return function( elem ) {
        return Sizzle( selector, elem ).length > 0;
      };
    }),

    "contains": markFunction(function( text ) {
      text = text.replace( runescape, funescape );
      return function( elem ) {
        return ( elem.textContent || elem.innerText || getText( elem ) ).indexOf( text ) > -1;
      };
    }),

    // "Whether an element is represented by a :lang() selector
    // is based solely on the element's language value
    // being equal to the identifier C,
    // or beginning with the identifier C immediately followed by "-".
    // The matching of C against the element's language value is performed case-insensitively.
    // The identifier C does not have to be a valid language name."
    // http://www.w3.org/TR/selectors/#lang-pseudo
    "lang": markFunction( function( lang ) {
      // lang value must be a valid identifier
      if ( !ridentifier.test(lang || "") ) {
        Sizzle.error( "unsupported lang: " + lang );
      }
      lang = lang.replace( runescape, funescape ).toLowerCase();
      return function( elem ) {
        var elemLang;
        do {
          if ( (elemLang = documentIsHTML ?
            elem.lang :
            elem.getAttribute("xml:lang") || elem.getAttribute("lang")) ) {

            elemLang = elemLang.toLowerCase();
            return elemLang === lang || elemLang.indexOf( lang + "-" ) === 0;
          }
        } while ( (elem = elem.parentNode) && elem.nodeType === 1 );
        return false;
      };
    }),

    // Miscellaneous
    "target": function( elem ) {
      var hash = window.location && window.location.hash;
      return hash && hash.slice( 1 ) === elem.id;
    },

    "root": function( elem ) {
      return elem === docElem;
    },

    "focus": function( elem ) {
      return elem === document.activeElement && (!document.hasFocus || document.hasFocus()) && !!(elem.type || elem.href || ~elem.tabIndex);
    },

    // Boolean properties
    "enabled": function( elem ) {
      return elem.disabled === false;
    },

    "disabled": function( elem ) {
      return elem.disabled === true;
    },

    "checked": function( elem ) {
      // In CSS3, :checked should return both checked and selected elements
      // http://www.w3.org/TR/2011/REC-css3-selectors-20110929/#checked
      var nodeName = elem.nodeName.toLowerCase();
      return (nodeName === "input" && !!elem.checked) || (nodeName === "option" && !!elem.selected);
    },

    "selected": function( elem ) {
      // Accessing this property makes selected-by-default
      // options in Safari work properly
      if ( elem.parentNode ) {
        elem.parentNode.selectedIndex;
      }

      return elem.selected === true;
    },

    // Contents
    "empty": function( elem ) {
      // http://www.w3.org/TR/selectors/#empty-pseudo
      // :empty is negated by element (1) or content nodes (text: 3; cdata: 4; entity ref: 5),
      //   but not by others (comment: 8; processing instruction: 7; etc.)
      // nodeType < 6 works because attributes (2) do not appear as children
      for ( elem = elem.firstChild; elem; elem = elem.nextSibling ) {
        if ( elem.nodeType < 6 ) {
          return false;
        }
      }
      return true;
    },

    "parent": function( elem ) {
      return !Expr.pseudos["empty"]( elem );
    },

    // Element/input types
    "header": function( elem ) {
      return rheader.test( elem.nodeName );
    },

    "input": function( elem ) {
      return rinputs.test( elem.nodeName );
    },

    "button": function( elem ) {
      var name = elem.nodeName.toLowerCase();
      return name === "input" && elem.type === "button" || name === "button";
    },

    "text": function( elem ) {
      var attr;
      return elem.nodeName.toLowerCase() === "input" &&
        elem.type === "text" &&

        // Support: IE<8
        // New HTML5 attribute values (e.g., "search") appear with elem.type === "text"
        ( (attr = elem.getAttribute("type")) == null || attr.toLowerCase() === "text" );
    },

    // Position-in-collection
    "first": createPositionalPseudo(function() {
      return [ 0 ];
    }),

    "last": createPositionalPseudo(function( matchIndexes, length ) {
      return [ length - 1 ];
    }),

    "eq": createPositionalPseudo(function( matchIndexes, length, argument ) {
      return [ argument < 0 ? argument + length : argument ];
    }),

    "even": createPositionalPseudo(function( matchIndexes, length ) {
      var i = 0;
      for ( ; i < length; i += 2 ) {
        matchIndexes.push( i );
      }
      return matchIndexes;
    }),

    "odd": createPositionalPseudo(function( matchIndexes, length ) {
      var i = 1;
      for ( ; i < length; i += 2 ) {
        matchIndexes.push( i );
      }
      return matchIndexes;
    }),

    "lt": createPositionalPseudo(function( matchIndexes, length, argument ) {
      var i = argument < 0 ? argument + length : argument;
      for ( ; --i >= 0; ) {
        matchIndexes.push( i );
      }
      return matchIndexes;
    }),

    "gt": createPositionalPseudo(function( matchIndexes, length, argument ) {
      var i = argument < 0 ? argument + length : argument;
      for ( ; ++i < length; ) {
        matchIndexes.push( i );
      }
      return matchIndexes;
    })
  }
};

Expr.pseudos["nth"] = Expr.pseudos["eq"];

// Add button/input type pseudos
for ( i in { radio: true, checkbox: true, file: true, password: true, image: true } ) {
  Expr.pseudos[ i ] = createInputPseudo( i );
}
for ( i in { submit: true, reset: true } ) {
  Expr.pseudos[ i ] = createButtonPseudo( i );
}

// Easy API for creating new setFilters
function setFilters() {}
setFilters.prototype = Expr.filters = Expr.pseudos;
Expr.setFilters = new setFilters();

tokenize = Sizzle.tokenize = function( selector, parseOnly ) {
  var matched, match, tokens, type,
    soFar, groups, preFilters,
    cached = tokenCache[ selector + " " ];

  if ( cached ) {
    return parseOnly ? 0 : cached.slice( 0 );
  }

  soFar = selector;
  groups = [];
  preFilters = Expr.preFilter;

  while ( soFar ) {

    // Comma and first run
    if ( !matched || (match = rcomma.exec( soFar )) ) {
      if ( match ) {
        // Don't consume trailing commas as valid
        soFar = soFar.slice( match[0].length ) || soFar;
      }
      groups.push( (tokens = []) );
    }

    matched = false;

    // Combinators
    if ( (match = rcombinators.exec( soFar )) ) {
      matched = match.shift();
      tokens.push({
        value: matched,
        // Cast descendant combinators to space
        type: match[0].replace( rtrim, " " )
      });
      soFar = soFar.slice( matched.length );
    }

    // Filters
    for ( type in Expr.filter ) {
      if ( (match = matchExpr[ type ].exec( soFar )) && (!preFilters[ type ] ||
        (match = preFilters[ type ]( match ))) ) {
        matched = match.shift();
        tokens.push({
          value: matched,
          type: type,
          matches: match
        });
        soFar = soFar.slice( matched.length );
      }
    }

    if ( !matched ) {
      break;
    }
  }

  // Return the length of the invalid excess
  // if we're just parsing
  // Otherwise, throw an error or return tokens
  return parseOnly ?
    soFar.length :
    soFar ?
      Sizzle.error( selector ) :
      // Cache the tokens
      tokenCache( selector, groups ).slice( 0 );
};

function toSelector( tokens ) {
  var i = 0,
    len = tokens.length,
    selector = "";
  for ( ; i < len; i++ ) {
    selector += tokens[i].value;
  }
  return selector;
}

function addCombinator( matcher, combinator, base ) {
  var dir = combinator.dir,
    checkNonElements = base && dir === "parentNode",
    doneName = done++;

  return combinator.first ?
    // Check against closest ancestor/preceding element
    function( elem, context, xml ) {
      while ( (elem = elem[ dir ]) ) {
        if ( elem.nodeType === 1 || checkNonElements ) {
          return matcher( elem, context, xml );
        }
      }
    } :

    // Check against all ancestor/preceding elements
    function( elem, context, xml ) {
      var oldCache, outerCache,
        newCache = [ dirruns, doneName ];

      // We can't set arbitrary data on XML nodes, so they don't benefit from dir caching
      if ( xml ) {
        while ( (elem = elem[ dir ]) ) {
          if ( elem.nodeType === 1 || checkNonElements ) {
            if ( matcher( elem, context, xml ) ) {
              return true;
            }
          }
        }
      } else {
        while ( (elem = elem[ dir ]) ) {
          if ( elem.nodeType === 1 || checkNonElements ) {
            outerCache = elem[ expando ] || (elem[ expando ] = {});
            if ( (oldCache = outerCache[ dir ]) &&
              oldCache[ 0 ] === dirruns && oldCache[ 1 ] === doneName ) {

              // Assign to newCache so results back-propagate to previous elements
              return (newCache[ 2 ] = oldCache[ 2 ]);
            } else {
              // Reuse newcache so results back-propagate to previous elements
              outerCache[ dir ] = newCache;

              // A match means we're done; a fail means we have to keep checking
              if ( (newCache[ 2 ] = matcher( elem, context, xml )) ) {
                return true;
              }
            }
          }
        }
      }
    };
}

function elementMatcher( matchers ) {
  return matchers.length > 1 ?
    function( elem, context, xml ) {
      var i = matchers.length;
      while ( i-- ) {
        if ( !matchers[i]( elem, context, xml ) ) {
          return false;
        }
      }
      return true;
    } :
    matchers[0];
}

function multipleContexts( selector, contexts, results ) {
  var i = 0,
    len = contexts.length;
  for ( ; i < len; i++ ) {
    Sizzle( selector, contexts[i], results );
  }
  return results;
}

function condense( unmatched, map, filter, context, xml ) {
  var elem,
    newUnmatched = [],
    i = 0,
    len = unmatched.length,
    mapped = map != null;

  for ( ; i < len; i++ ) {
    if ( (elem = unmatched[i]) ) {
      if ( !filter || filter( elem, context, xml ) ) {
        newUnmatched.push( elem );
        if ( mapped ) {
          map.push( i );
        }
      }
    }
  }

  return newUnmatched;
}

function setMatcher( preFilter, selector, matcher, postFilter, postFinder, postSelector ) {
  if ( postFilter && !postFilter[ expando ] ) {
    postFilter = setMatcher( postFilter );
  }
  if ( postFinder && !postFinder[ expando ] ) {
    postFinder = setMatcher( postFinder, postSelector );
  }
  return markFunction(function( seed, results, context, xml ) {
    var temp, i, elem,
      preMap = [],
      postMap = [],
      preexisting = results.length,

      // Get initial elements from seed or context
      elems = seed || multipleContexts( selector || "*", context.nodeType ? [ context ] : context, [] ),

      // Prefilter to get matcher input, preserving a map for seed-results synchronization
      matcherIn = preFilter && ( seed || !selector ) ?
        condense( elems, preMap, preFilter, context, xml ) :
        elems,

      matcherOut = matcher ?
        // If we have a postFinder, or filtered seed, or non-seed postFilter or preexisting results,
        postFinder || ( seed ? preFilter : preexisting || postFilter ) ?

          // ...intermediate processing is necessary
          [] :

          // ...otherwise use results directly
          results :
        matcherIn;

    // Find primary matches
    if ( matcher ) {
      matcher( matcherIn, matcherOut, context, xml );
    }

    // Apply postFilter
    if ( postFilter ) {
      temp = condense( matcherOut, postMap );
      postFilter( temp, [], context, xml );

      // Un-match failing elements by moving them back to matcherIn
      i = temp.length;
      while ( i-- ) {
        if ( (elem = temp[i]) ) {
          matcherOut[ postMap[i] ] = !(matcherIn[ postMap[i] ] = elem);
        }
      }
    }

    if ( seed ) {
      if ( postFinder || preFilter ) {
        if ( postFinder ) {
          // Get the final matcherOut by condensing this intermediate into postFinder contexts
          temp = [];
          i = matcherOut.length;
          while ( i-- ) {
            if ( (elem = matcherOut[i]) ) {
              // Restore matcherIn since elem is not yet a final match
              temp.push( (matcherIn[i] = elem) );
            }
          }
          postFinder( null, (matcherOut = []), temp, xml );
        }

        // Move matched elements from seed to results to keep them synchronized
        i = matcherOut.length;
        while ( i-- ) {
          if ( (elem = matcherOut[i]) &&
            (temp = postFinder ? indexOf( seed, elem ) : preMap[i]) > -1 ) {

            seed[temp] = !(results[temp] = elem);
          }
        }
      }

    // Add elements to results, through postFinder if defined
    } else {
      matcherOut = condense(
        matcherOut === results ?
          matcherOut.splice( preexisting, matcherOut.length ) :
          matcherOut
      );
      if ( postFinder ) {
        postFinder( null, results, matcherOut, xml );
      } else {
        push.apply( results, matcherOut );
      }
    }
  });
}

function matcherFromTokens( tokens ) {
  var checkContext, matcher, j,
    len = tokens.length,
    leadingRelative = Expr.relative[ tokens[0].type ],
    implicitRelative = leadingRelative || Expr.relative[" "],
    i = leadingRelative ? 1 : 0,

    // The foundational matcher ensures that elements are reachable from top-level context(s)
    matchContext = addCombinator( function( elem ) {
      return elem === checkContext;
    }, implicitRelative, true ),
    matchAnyContext = addCombinator( function( elem ) {
      return indexOf( checkContext, elem ) > -1;
    }, implicitRelative, true ),
    matchers = [ function( elem, context, xml ) {
      return ( !leadingRelative && ( xml || context !== outermostContext ) ) || (
        (checkContext = context).nodeType ?
          matchContext( elem, context, xml ) :
          matchAnyContext( elem, context, xml ) );
    } ];

  for ( ; i < len; i++ ) {
    if ( (matcher = Expr.relative[ tokens[i].type ]) ) {
      matchers = [ addCombinator(elementMatcher( matchers ), matcher) ];
    } else {
      matcher = Expr.filter[ tokens[i].type ].apply( null, tokens[i].matches );

      // Return special upon seeing a positional matcher
      if ( matcher[ expando ] ) {
        // Find the next relative operator (if any) for proper handling
        j = ++i;
        for ( ; j < len; j++ ) {
          if ( Expr.relative[ tokens[j].type ] ) {
            break;
          }
        }
        return setMatcher(
          i > 1 && elementMatcher( matchers ),
          i > 1 && toSelector(
            // If the preceding token was a descendant combinator, insert an implicit any-element `*`
            tokens.slice( 0, i - 1 ).concat({ value: tokens[ i - 2 ].type === " " ? "*" : "" })
          ).replace( rtrim, "$1" ),
          matcher,
          i < j && matcherFromTokens( tokens.slice( i, j ) ),
          j < len && matcherFromTokens( (tokens = tokens.slice( j )) ),
          j < len && toSelector( tokens )
        );
      }
      matchers.push( matcher );
    }
  }

  return elementMatcher( matchers );
}

function matcherFromGroupMatchers( elementMatchers, setMatchers ) {
  var bySet = setMatchers.length > 0,
    byElement = elementMatchers.length > 0,
    superMatcher = function( seed, context, xml, results, outermost ) {
      var elem, j, matcher,
        matchedCount = 0,
        i = "0",
        unmatched = seed && [],
        setMatched = [],
        contextBackup = outermostContext,
        // We must always have either seed elements or outermost context
        elems = seed || byElement && Expr.find["TAG"]( "*", outermost ),
        // Use integer dirruns iff this is the outermost matcher
        dirrunsUnique = (dirruns += contextBackup == null ? 1 : Math.random() || 0.1),
        len = elems.length;

      if ( outermost ) {
        outermostContext = context !== document && context;
      }

      // Add elements passing elementMatchers directly to results
      // Keep `i` a string if there are no elements so `matchedCount` will be "00" below
      // Support: IE<9, Safari
      // Tolerate NodeList properties (IE: "length"; Safari: <number>) matching elements by id
      for ( ; i !== len && (elem = elems[i]) != null; i++ ) {
        if ( byElement && elem ) {
          j = 0;
          while ( (matcher = elementMatchers[j++]) ) {
            if ( matcher( elem, context, xml ) ) {
              results.push( elem );
              break;
            }
          }
          if ( outermost ) {
            dirruns = dirrunsUnique;
          }
        }

        // Track unmatched elements for set filters
        if ( bySet ) {
          // They will have gone through all possible matchers
          if ( (elem = !matcher && elem) ) {
            matchedCount--;
          }

          // Lengthen the array for every element, matched or not
          if ( seed ) {
            unmatched.push( elem );
          }
        }
      }

      // Apply set filters to unmatched elements
      matchedCount += i;
      if ( bySet && i !== matchedCount ) {
        j = 0;
        while ( (matcher = setMatchers[j++]) ) {
          matcher( unmatched, setMatched, context, xml );
        }

        if ( seed ) {
          // Reintegrate element matches to eliminate the need for sorting
          if ( matchedCount > 0 ) {
            while ( i-- ) {
              if ( !(unmatched[i] || setMatched[i]) ) {
                setMatched[i] = pop.call( results );
              }
            }
          }

          // Discard index placeholder values to get only actual matches
          setMatched = condense( setMatched );
        }

        // Add matches to results
        push.apply( results, setMatched );

        // Seedless set matches succeeding multiple successful matchers stipulate sorting
        if ( outermost && !seed && setMatched.length > 0 &&
          ( matchedCount + setMatchers.length ) > 1 ) {

          Sizzle.uniqueSort( results );
        }
      }

      // Override manipulation of globals by nested matchers
      if ( outermost ) {
        dirruns = dirrunsUnique;
        outermostContext = contextBackup;
      }

      return unmatched;
    };

  return bySet ?
    markFunction( superMatcher ) :
    superMatcher;
}

compile = Sizzle.compile = function( selector, match /* Internal Use Only */ ) {
  var i,
    setMatchers = [],
    elementMatchers = [],
    cached = compilerCache[ selector + " " ];

  if ( !cached ) {
    // Generate a function of recursive functions that can be used to check each element
    if ( !match ) {
      match = tokenize( selector );
    }
    i = match.length;
    while ( i-- ) {
      cached = matcherFromTokens( match[i] );
      if ( cached[ expando ] ) {
        setMatchers.push( cached );
      } else {
        elementMatchers.push( cached );
      }
    }

    // Cache the compiled function
    cached = compilerCache( selector, matcherFromGroupMatchers( elementMatchers, setMatchers ) );

    // Save selector and tokenization
    cached.selector = selector;
  }
  return cached;
};

/**
 * A low-level selection function that works with Sizzle's compiled
 *  selector functions
 * @param {String|Function} selector A selector or a pre-compiled
 *  selector function built with Sizzle.compile
 * @param {Element} context
 * @param {Array} [results]
 * @param {Array} [seed] A set of elements to match against
 */
select = Sizzle.select = function( selector, context, results, seed ) {
  var i, tokens, token, type, find,
    compiled = typeof selector === "function" && selector,
    match = !seed && tokenize( (selector = compiled.selector || selector) );

  results = results || [];

  // Try to minimize operations if there is no seed and only one group
  if ( match.length === 1 ) {

    // Take a shortcut and set the context if the root selector is an ID
    tokens = match[0] = match[0].slice( 0 );
    if ( tokens.length > 2 && (token = tokens[0]).type === "ID" &&
        support.getById && context.nodeType === 9 && documentIsHTML &&
        Expr.relative[ tokens[1].type ] ) {

      context = ( Expr.find["ID"]( token.matches[0].replace(runescape, funescape), context ) || [] )[0];
      if ( !context ) {
        return results;

      // Precompiled matchers will still verify ancestry, so step up a level
      } else if ( compiled ) {
        context = context.parentNode;
      }

      selector = selector.slice( tokens.shift().value.length );
    }

    // Fetch a seed set for right-to-left matching
    i = matchExpr["needsContext"].test( selector ) ? 0 : tokens.length;
    while ( i-- ) {
      token = tokens[i];

      // Abort if we hit a combinator
      if ( Expr.relative[ (type = token.type) ] ) {
        break;
      }
      if ( (find = Expr.find[ type ]) ) {
        // Search, expanding context for leading sibling combinators
        if ( (seed = find(
          token.matches[0].replace( runescape, funescape ),
          rsibling.test( tokens[0].type ) && testContext( context.parentNode ) || context
        )) ) {

          // If seed is empty or no tokens remain, we can return early
          tokens.splice( i, 1 );
          selector = seed.length && toSelector( tokens );
          if ( !selector ) {
            push.apply( results, seed );
            return results;
          }

          break;
        }
      }
    }
  }

  // Compile and execute a filtering function if one is not provided
  // Provide `match` to avoid retokenization if we modified the selector above
  ( compiled || compile( selector, match ) )(
    seed,
    context,
    !documentIsHTML,
    results,
    rsibling.test( selector ) && testContext( context.parentNode ) || context
  );
  return results;
};

// One-time assignments

// Sort stability
support.sortStable = expando.split("").sort( sortOrder ).join("") === expando;

// Support: Chrome 14-35+
// Always assume duplicates if they aren't passed to the comparison function
support.detectDuplicates = !!hasDuplicate;

// Initialize against the default document
setDocument();

// Support: Webkit<537.32 - Safari 6.0.3/Chrome 25 (fixed in Chrome 27)
// Detached nodes confoundingly follow *each other*
support.sortDetached = assert(function( div1 ) {
  // Should return 1, but returns 4 (following)
  return div1.compareDocumentPosition( document.createElement("div") ) & 1;
});

// Support: IE<8
// Prevent attribute/property "interpolation"
// http://msdn.microsoft.com/en-us/library/ms536429%28VS.85%29.aspx
if ( !assert(function( div ) {
  div.innerHTML = "<a href='#'></a>";
  return div.firstChild.getAttribute("href") === "#" ;
}) ) {
  addHandle( "type|href|height|width", function( elem, name, isXML ) {
    if ( !isXML ) {
      return elem.getAttribute( name, name.toLowerCase() === "type" ? 1 : 2 );
    }
  });
}

// Support: IE<9
// Use defaultValue in place of getAttribute("value")
if ( !support.attributes || !assert(function( div ) {
  div.innerHTML = "<input/>";
  div.firstChild.setAttribute( "value", "" );
  return div.firstChild.getAttribute( "value" ) === "";
}) ) {
  addHandle( "value", function( elem, name, isXML ) {
    if ( !isXML && elem.nodeName.toLowerCase() === "input" ) {
      return elem.defaultValue;
    }
  });
}

// Support: IE<9
// Use getAttributeNode to fetch booleans when getAttribute lies
if ( !assert(function( div ) {
  return div.getAttribute("disabled") == null;
}) ) {
  addHandle( booleans, function( elem, name, isXML ) {
    var val;
    if ( !isXML ) {
      return elem[ name ] === true ? name.toLowerCase() :
          (val = elem.getAttributeNode( name )) && val.specified ?
          val.value :
        null;
    }
  });
}

// EXPOSE
if ( typeof define === "function" && define.amd ) {
  define(function() { return Sizzle; });
// Sizzle requires that there be a global window in Common-JS like environments
} else if ( typeof module !== "undefined" && module.exports ) {
  module.exports = Sizzle;
} else {
  window.Sizzle = Sizzle;
}
// EXPOSE

})( window );;/**

/**
 * Hackathon.js
 * Built by Bilawal Hameed and released freely under the MIT License (http://bih.mit-license.org)
 * Released on GitHub - http://github.com/bih/hackathon.js
 * @namespace
 */
var HackathonJS = {
  /** @private */ ready: false,
  /** @private */ data: {},
  /** @private */ params: {},
  /** @public */  config: {},
  /** @public */  dom: false,

  /** @namespace */  tools: {},
  /** @namespace */  helpers: {},
  
  /** @const */   VERSION: "0.0.1",
  /** @const */   UNDEF: undefined,
  /** @const */   SPACE: " "
};

(function($, M, H) {

  /**
   * Store key-value data either in memory (temporary) or on disk (persistent) within Hackathon.JS
   * @alias HackathonJS.set
   * @param  {String}  key - A unique identifiable key (e.g. <code>name</code>)
   * @param  {*}       value - The value you want to store (e.g. <code>"John Smith"</code>)
   * @param  {Boolean} [persistent] - If true, save data persistently via HTML5 <code>localStorage</code>
   * @return {*}       The <code>value</code> parameter will be returned
   *
   * @example
   * HackathonJS.set("name", "John Smith", true); // =>  "John Smith"
   */
  H.set = function(key, value, persistent) {
    if(typeof persistent !== String(H.UNDEF)) {
      window.localStorage[key] = value; // localStorage
    } else {
      this.data[key] = value; // in memory
    }
    
    return value;
  };

  /**
   * Retrieve the value from a key stored in Hackathon.JS
   * @alias HackathonJS.get
   * @param {String}   key - The unique identifiable key (e.g. <code>name</code>)
   * @return {*}       The value associated with the key, if available. Otherwise <code>undefined</code>. (e.g. <code>"John Smith"</code>)
   *
   * @example
   * HackathonJS.get("name"); // => "John Smith"
   */
  H.get = function(key) { 
    return this.data[key] || window.localStorage[key] || H.UNDEF;
  };

  /**
   * Permanently destroy the value associated with a key.
   * @alias HackathonJS.destroy
   * @param {String}   key - The unique identifiable key (e.g. <code>name</code>)
   * @return {*}       The value associated with the key, if available. Otherwise <code>undefined</code>. (e.g. <code>"John Smith"</code>)
   *
   * @example
   * HackathonJS.destroy("name"); // => "John Smith"
   */
  H.destroy = function(key) {
    var value = this.get(key);
    delete this.data[key];
    delete window.localStorage[key];
    return value;
  };

  /**
   * Extend Hackathon.js with a new function.
   * @alias HackathonJS.extend
   * @param {String}        name - The name of the function
   * @param {Function(): *} _function - The function you would like to associate with <code>name</code>
   * @param {Boolean}       [override] - If function already exists, should we override?
   *
   * @example
   * HackathonJS.extend("capitaliseName", function(name) {
   *   return name.substr(0, 1).toUpperCase() + name.substr(1, name.length - 1);
   * });
   *
   * HackathonJS.capitaliseName("matthew") // => "Matthew"
   */
  H.extend = function(name, _function, override) {
    /* jshint ignore:start */
    return this[name] = (!override ? this[name] : H.UNDEF) || _function;
    /* jshint ignore:end */
  };

  /**
   * Lightweight wrapper to identify when a HackOne profile has been found via the bookmarklet or via web authorisation.
   * @alias HackathonJS.hackOneSuccess
   * @param {hackOneCallback} callback - The function to run when a profile has been retrieved.
   *
   * @example
   * HackathonJS.hackOneSuccess(function(user) {
   *   // Successful bookmarklet or authentication!
   *   console.log(user);
   * });
   */
  H.hackOneSuccess = function(callback){
    if(typeof callback === "function") {
      var hackoneToken;

      // When the bookmarklet has been pressed.
      window.onHackOneBookmarkletPress = function(user) {
        callback(user);
      };

      // When a successful authorization happens.
      if((hackoneToken = H.tools.params("hackone_token")) != H.UNDEF) {
        H.tools.getJSON("https://www.hackone.co/o/collect?hackone_token=" + hackoneToken, function(response) {
          if(typeof response.user !== String(H.UNDEF)) {
            callback(response.user);
          }
        }, function(){
          console.error("HackathonJS hackOne: We received a callback request from HackOne, but the token was invalid.");
        });
      }
    }
  };

  /**
   * Callback for when a HackOne profile has been identified.
   * @callback hackOneCallback
   * @param {Object} user - User object of authenticated HackOne account (Example: http://www.hackone.co/example.json)
   */

  /**
   * A lightweight wrapper for Google Analytics.
   * @alias HackathonJS.googleAnalytics
   * @param {String}   ga_id - Google Analytics ID
   * 
   * @example
   * HackathonJS.googleAnalytics('UA-XXXXXXXX-X');
   */
  H.googleAnalytics = function(ga_id) {
    try {
      /* jshint ignore:start */
      (function(i,s,o,g,r,a,m){i['GoogleAnalyticsObject']=r;i[r]=i[r]||function(){
      (i[r].q=i[r].q||[]).push(arguments)},i[r].l=1*new Date();a=s.createElement(o),
      m=s.getElementsByTagName(o)[0];a.async=1;a.src=g;m.parentNode.insertBefore(a,m)
      })(window,document,'script','//www.google-analytics.com/analytics.js','ga');ga('create', ga_id);ga('send', 'pageview');
      /* jshint ignore:end */

      H.config.googleAnalytics = { id: ga_id, status: "OK" };
    } catch(err) {
      H.config.googleAnalytics = { id: ga_id, status: "error", errorMessage: err };
    }
  };

  /**
   * Initiate the Hackathon.js framework on DOM ready. It is by default already initiated but for future reasons we've defined it as <code>HackathonJS.hack()</code>.
   * @alias HackathonJS.hack
   * 
   * @example
   * HackathonJS.hack();
   */
  H.hack = function(){
    // What if it is ready?
    if(H.ready === true) {
      return this;
    }

    // Make sure it's only ran once
    H.ready = true;

    // Does the user (via a DOM attribute) tell us to do some DOM magic?
    if(document.body.dataset.hackathonjs === "true") {
      H.dom = true;
    }

    // Load all helpers!
    for(var helper in this.helpers) {
      if(this.helpers[helper]() === true) {
        delete this.helpers[helper];
      }
    }

    // And we have loaded everything. Woohoo!
    console.log("HackathonJS has loaded! (Version " + this.VERSION + ")");
    return this;
  };

  /**
   * Extended Date functions to make countdowns really easy to work with.
   */
  H.helpers.datesDayMonthYearHourSecond = function() {
    // generaal convenience helpers
    Date.prototype.second = function() { return this.getSeconds(); };
    Date.prototype.minute = function() { return this.getMinutes(); };
    Date.prototype.hour = function() { return this.getHours(); };
    Date.prototype.day = function() { return this.getDay(); };
    Date.prototype.month = function() { return this.getMonth(); };
    Date.prototype.monthName = function(){ return ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][this.getMonth()]; };
    Date.prototype.year = function() { return this.getFullYear(); };

    // from now?
    Date.prototype.secondsFromNow = function(date){ return parseInt(parseInt(Date.parse(this) / 1000) - parseInt((date || Date.now()) / 1000)); };
    Date.prototype.minutesFromNow = function(){ return parseInt(this.secondsFromNow() / 60); };
    Date.prototype.hoursFromNow = function(){ return parseInt(this.minutesFromNow() / 60); };
    Date.prototype.daysFromNow = function(){ return parseInt(this.hoursFromNow() / 24); };
    Date.prototype.weeksFromNow = function(){ return parseInt(this.daysFromNow() / 7); };
    Date.prototype.monthsFromNow = function(){ return parseInt(this.weeksFromNow() / 4); };
    Date.prototype.longFromNow = function(){ return { months: this.monthsFromNow().stringify(), weeks: (this.weeksFromNow() % 4).stringify(), days: (this.daysFromNow() % 7).stringify(), hours: (this.hoursFromNow() % 24).stringify(), minutes: (this.minutesFromNow() % 60).stringify(), seconds: (this.secondsFromNow() % 60).stringify() }; };
    Date.prototype.longFromNowText = function(){ var fromNow; fromNow = this.longFromNow(); return H.tools.pluralize(fromNow.months, "month") + ", " + H.tools.pluralize(fromNow.weeks, "week") + ", " + H.tools.pluralize(fromNow.days, "day") + ", " + H.tools.pluralize(fromNow.hours, "hour") + ", " + H.tools.pluralize(fromNow.minutes, "minute") + " and " + H.tools.pluralize(fromNow.seconds, "second"); };
    Date.prototype.fromNow = function(){ return { days: this.daysFromNow().stringify(), hours: (this.hoursFromNow() % 24).stringify(), minutes: (this.minutesFromNow() % 60).stringify(), seconds: (this.secondsFromNow() % 60).stringify() }; };
    Date.prototype.fromNowText = function(){ var fromNow; fromNow = this.fromNow(); return H.tools.pluralize(fromNow.days, "day") + ", " + H.tools.pluralize(fromNow.hours, "hour") + ", " + H.tools.pluralize(fromNow.minutes, "minute") + " and " + H.tools.pluralize(fromNow.seconds, "second"); };

    // Make sure to set true if you only want this to be ran once!
    return true;
  };

  /**
   * Extended HTMLElement helpers with convenience functions
   */
  H.helpers.htmlElementHelpers = function() {
    HTMLElement.prototype.remove = function() { return this.parentNode.removeChild(this); };

    // Make sure to set true if you only want this to be ran once!
    return true;
  };

  /**
   * Extended Number helpers to let you customize them better.
   */
  H.helpers.numberHelpers = function() {
    // so numbers don't come as "24:6:10" (and rather "24:06:10")
    Number.prototype.stringify = function() {
      if(this >= 0 && this < 10) {
        return "0" + String(this);
      } else {
        return String(this);
      }
    };

    // slightly more accurate version of parseInt
    window.parseInteger = function(n) {
      return window.parseInt(n.replace(/ /g, ""));
    };

    // comma format and decimal point yo' numbers!
    Number.prototype.format = function(decPlaces, thouSeparator, decSeparator) {
      var n, i, j, sign;

      n = this;
      sign = n < 0 ? "-" : "";
      
      decPlaces = isNaN(decPlaces = Math.abs(decPlaces)) ? 2 : decPlaces;
      decSeparator = decSeparator === H.UNDEF ? "." : decSeparator;
      thouSeparator = thouSeparator === H.UNDEF ? "," : thouSeparator;

      i = parseInt(n = Math.abs(+n || 0).toFixed(decPlaces)) + "";
      j = (j = i.length) > 3 ? j % 3 : 0;

      return sign + (j ? i.substr(0, j) + thouSeparator : "") + i.substr(j).replace(/(\d{3})(?=\d)/g, "$1" + thouSeparator) + (decPlaces ? decSeparator + Math.abs(n - i).toFixed(decPlaces).slice(2) : "");
    };

    // Make sure to set true if you only want this to be ran once!
    return true;
  };

  /**
   * Extended String helpers to let you write epic one-liner JSON requests.
   * @example
   * "http://graph.facebook.com/studenthack".getJSON(function(json){ console.log(json); })
   */
  H.helpers.stringAsGetPostParseJSON = function() {
    String.prototype.getJSON = function(success, error) { return H.tools.getJSON(this, success, error); };
    String.prototype.postJSON = function(params, success, error) { return H.tools.postJSON(this, params, success, error); };
    String.prototype.parseJSON = String.prototype.json = function(defaults) { return H.tools.parseJSON(this, defaults); };

    // Make sure to set true if you only want this to be ran once!
    return true;
  };

  // The incredible wall. This is the best thing like ever!
  H.helpers.setupWall = function() {
    /**
     * Helper: Setup the entire toolset for a hackathon wall display.
     * @alias HackathonJS.wall
     * @param {Object}   dom - The Object to allow us to create the Eventbrite Widget.
     * 
     * @example
     * HackathonJS.wall(document.getElementById('wall'));
     */
    H.wall = function(dom) {
      if(typeof dom !== String(H.UNDEF)) {
        // right, let the madness begin.
        var dom_entries, entries, startTime, endTime;

        entries = [];
        dom_entries = dom.getElementsByTagName('entry');

        for(var i = 0; i < dom_entries.length; i++) {
          // Figure out when the event starts
          if(dom_entries[i].dataset.start === "") {
            startTime = H.tools.parseTime(dom_entries[i].dataset.from);
          }

          // Figure out when the event ends
          if(dom_entries[i].dataset.end === "") {
            endTime = H.tools.parseTime(dom_entries[i].dataset.from);
          }

          entries.push({
            from: (typeof dom_entries[i].dataset.from !== String(H.UNDEF) ? (H.tools.parseTime(dom_entries[i].dataset.from) || H.UNDEF) : H.UNDEF),
            until: (typeof dom_entries[i].dataset.until !== String(H.UNDEF) ? (H.tools.parseTime(dom_entries[i].dataset.until) || H.UNDEF) : H.UNDEF),
            resource: dom_entries[i]
          });
        }

        // store wall entries in memory
        H.set("wall.entries", entries);
        H.set("wall.starts", startTime);
        H.set("wall.ends", endTime);

        if(typeof startTime === String(H.UNDEF) || typeof endTime === String(H.UNDEF)) {
          alert('You need to have a [data-start] and [data-end] entry for the Wall to begin running.');
          return;
        }

        // update colours?
        var colours, parsed_colours;
        colours = $('[data-wall]')[0].dataset.colours.split(',').map(function(item){ return item.trim().replace(/ /g, ""); });
        parsed_colours = [];

        for(var i = 0; i < colours.length; i++) {
          parsed_colours.push({
            text: "#" + (colours[i].split(':')[0] || "FFFFFF").toUpperCase(),
            background: "#" + (colours[i].split(':')[1] || "444444").toUpperCase()
          });
        }

        // set the index of the colours at 0
        $('[data-wall]')[0].dataset.wallColourIndex = 0;

        // delete the colours attribute as it not needed anymore
        delete $('[data-wall]')[0].dataset.colours;

        // save the colours to memory
        H.set("wall.colours", parsed_colours);

        // set current entry as 0
        $('[data-wall] #text')[0].dataset.textIndex = -1;

        // get latest entries?
        var getEntriesRightNow;
        getEntriesRightNow = function() {
          var from_valid, until_valid, show, curTime, entries;
          entries = H.get("wall.entries");

          for(var i = 0; i < entries.length; i++) {
            from_valid = (typeof entries[i].from !== String(H.UNDEF));
            until_valid = (typeof entries[i].until !== String(H.UNDEF));
            show = false;
            curTime = new Date();

            if(from_valid && until_valid && curTime >= entries[i].from && curTime < entries[i].until) {
              show = true;
            } else if(from_valid && !until_valid && curTime >= entries[i].from) {
              show = true;
            } else if(!from_valid && until_valid && curTime < entries[i].until) {
              show = true;
            }

            // ok, we should show it!
            if(show === true) {
              var mustache, start, end, curTime;
              start = H.get("wall.starts").fromNow();
              end = H.get("wall.ends").fromNow();
              curTime = new Date();

              mustache = H.tools.mustacheFunctions(H.data, {
                starts: start["days"] + ":" + start["hours"] + ":" + start["minutes"] + ":" + start["seconds"],
                ends: end["days"] + ":" + end["hours"] + ":" + end["minutes"] + ":" + end["seconds"],
                time: curTime.hour() + ":" + curTime.minute()
              })

              if(i !== parseInt($('[data-wall] #text')[0].dataset.textIndex)) {
                // yay, time to show this item and write to dom.
                $('[data-wall] #text')[0].dataset.textIndex = i;
                $('[data-wall] #text')[0].innerHTML = M.render(entries[i].resource.outerHTML, mustache);
              } else {
                var output;
                output = M.render(entries[i].resource.innerHTML, mustache);

                if(output !== $('[data-wall] #text entry')[0].innerHTML) {
                  // again, saving a pointless dom write. these are costly in cpu.
                  $('[data-wall] #text entry')[0].innerHTML = output;
                }
              }

              // this is to stop rewriting the dom every second.
              return entries[i];
            }
          }
        };

        // run a loop every second
        var intervalId, secondsElapsed;
        secondsElapsed = 0;

        intervalId = setInterval(function() {
          if(secondsElapsed % 60 === 0) {
            // parse the colour index right now
            var parsedColourIndex, colours;
            parsedColourIndex = parseInt($('[data-wall]')[0].dataset.wallColourIndex);
            colours = H.get('wall.colours');

            // and update it
            parsedColourIndex += 1;

            // and check if it exists, if not, reset baby.
            if(typeof colours[parsedColourIndex] === String(H.UNDEF)) {
              parsedColourIndex = 0;
            }

            // hell yeah!
            $('[data-wall]')[0].dataset.wallColourIndex = parsedColourIndex;
            $('[data-wall] #text entry')[0].style.color = String(colours[parsedColourIndex].text);
            $('[data-wall]')[0].style.backgroundColor = String(colours[parsedColourIndex].background);
          }

          // update seconds elapsed 
          secondsElapsed += 1;

          // of course, look for entries too! :)
          getEntriesRightNow();
        }, 1000);
        
        // update wall id with interval reference id
        $('[data-wall]')[0].dataset.wallId = intervalId;

        // and let's untame this beast
        getEntriesRightNow();
      }
    };
  };

  // The lovely helper for Eventbrite!
  H.helpers.setupEventbriteWidget = function() {
    /**
     * Helper: Include Eventbrite widget on your website.
     * @alias HackathonJS.loadEventbriteWidget
     * @param {Object}   dom - The Object to allow us to create the Eventbrite Widget.
     * @param {Hash}     [options] - Array of options to customize the widget
     * 
     * @example
     * HackathonJS.loadEventBriteWidget(document.getElementById('eventbritewidget'), { id: "1000000", width: "300px" });
     */
    H.loadEventbriteWidget = function(dom, options) {
      if(dom !== null) {
        options = options || { id: 0 };

        var ebIframe = document.createElement('iframe');
        ebIframe.src = "http://www.eventbrite.com/tickets-external?eid=" + options.id + "&v=2";
        ebIframe.frameborder = options.frameborder || "0";
        ebIframe.width = options.width || "100%";
        ebIframe.height = options.height || "256";
        ebIframe.vspace = options.vspace || "0";
        ebIframe.hspace = options.hspace || "0";
        ebIframe.marginheight = options.marginheight || "5";
        ebIframe.marginwidth = options.marginwidth || "5";
        ebIframe.scrolling = options.scrolling || "auto";
        ebIframe.allowtransparency = options.allowtransparency || "true";

        dom.style.cssText = "width:100%; text-align:left;";
        dom.innerHTML = ebIframe.outerHTML;

        return true;
      }

      return false;
    };

    // Make sure to set true if you only want this to be ran once!
    return true;
  };

  // Mmmm, Facebook.
  H.helpers.setupFacebookPageIntegration = function() {
    /**
     * Helper: Get live JSON of your Facebook page for your hackathon.
     * @alias HackathonJS.getFacebookPageInfo
     * @param {String}                   graph_url - The full link to your Facebook page (i.e. <code>http://www.facebook.com/studenthack</code>)
     * @param {facebookPageCallback}     callback - Function which returns an object of page details.
     * 
     * @example
     * HackathonJS.getFacebookPageInfo("http://www.facebook.com/studenthack", function(page) {
     *   console.log("Oh nice, my facebook page has a lovely " + page.likes + " likes!");
     * });
     */
    H.getFacebookPageInfo = function(graph_url, callback) {
      graph_url = graph_url.replace(/\/\/www./g, "//graph.").replace(/http:\/\//g, "https://");

      if(new URL(graph_url).hostname.toLowerCase() != "graph.facebook.com") {
        console.error("HackathonJS getFacebookPageInfo: " + graph_url + " is not a valid Facebook Page URL (i.e. http://www.facebook.com/studenthack)");
      } else {
        H.tools.getJSON(graph_url, function(response){
          if(typeof callback !== String(H.UNDEF)) {
            callback(response);
          } else {
            console.log("HackathonJS getFacebookPageInfo: " + graph_url + " was successful but no callback was initiated.");
          }
        });
      }
    };

    // Make sure to set true if you only want this to be ran once!
    return true;
  };

  /**
   * Callback for when a Facebook Page information has been collected.
   * @callback facebookPageCallback
   * @param {Object} page - Page object containing information about the Facebook page
   */

  // Typekit. Nice!
  H.helpers.setupTypekitIntegration = function() {
    /**
     * Helper: Add Typekit.com fonts to your site in one line.
     * @alias HackathonJS.typekit
     * @param {String}  id - The ID of your Typekit script (i.e. <code>http://use.typekit.net/<strong>fpj1avo</strong>.js</code>)
     * 
     * @example
     * HackathonJS.typekit("fpj1avo");
     */
    H.typekit = function(id) {
      var head, script, callback;

      callback = function() {
        try {
          Typekit.load();
        } catch(e) {
          console.error("HackathonJS typekit: Could not load Typekit with ID '" + id.replace(/ /g, "") + "'");
        }
      };

      head = $('head')[0];
      script = document.createElement('script');
      script.type = 'text/javascript';
      script.async = true;
      script.src = '//use.typekit.net/' + id.replace(/ /g, "") + '.js';
      script.onreadystatechange = callback;
      script.onload = callback;
      script.onerror = callback;

      head.appendChild(script);
    };

    // Make sure to set true if you only want this to be ran once!
    return true;
  };

  // An incredible form builder. I love this the most.
  H.helpers.addFormBuilder = function() {
    /**
     * Helper: Have an awesome form builder.
     * @alias HackathonJS.formBuilder
     * @param {String}                   graph_url - The full link to your Facebook page (i.e. <code>http://www.facebook.com/studenthack</code>)
     * @param {facebookPageCallback}     callback - Function which returns an object of page details.
     * 
     * @example
     * HackathonJS.getFacebookPageInfo("http://www.facebook.com/studenthack", function(page) {
     *   console.log("Oh nice, my facebook page has a lovely " + page.likes + " likes!");
     * });
     */
    H.formBuilder = function(dom, callback) {
      if(typeof dom.dataset.formFields !== String(H.UNDEF)) {
          var field, fields, output;
          fields = String(dom.dataset.formFields).split(',').map(function(item){ return item.trim(); });
          output = "";

          for(field in fields) {
            output += H.helpers.addInputField(fields[field]);
          }

          dom.innerHTML += output;

          var form_sync_fields, form_sync_func;
          form_sync_fields = $("[data-form-sync]");
          form_sync_func = function() { H.set("form_sync_" + this.getAttribute('id'), this.value, true); };

          for(var i = 0; i < form_sync_fields.length; i++) {
            form_sync_fields[i].value = H.get("form_sync_" + form_sync_fields[i].getAttribute('id')) || "";
            
            form_sync_fields[i].addEventListener("keyup", form_sync_func);
            form_sync_fields[i].addEventListener("keydown", form_sync_func);
            form_sync_fields[i].addEventListener("keypress", form_sync_func);
            form_sync_fields[i].addEventListener("change", form_sync_func);
          }

          if(typeof callback === "function") {
            callback();
          }
      }
    };

    H.formSyncReset = function() {
      for(var item in window.localStorage) {
        if(item.substr(0, 10) === "form_sync_") {
          delete window.localStorage[item];
        }
      }

      return true;
    };

    // Make sure to set true if you only want this to be ran once!
    return true;
  };

  // Manually add an input field with HackOne support. This is pretty sick.
  H.helpers.addInputField = function(field, options) {
    var _field;
    var inputHtml, selectHtml;

    // options is an optional parameter
    options = options || {};

    // The styling for the different HTML fields for the form builder
    inputHtml = options.inputHtml || "<label for=\"{{id}}\">{{label}}</label> <input data-form-sync type=\"{{type}}\" id=\"{{id}}\" name=\"{{id}}\" value=\"\" placeholder=\"{{placeholder}}\" data-hackone=\"{{hackOneField}}\" />";
    selectHtml = options.selectHtml || "<label for=\"{{id}}\">{{label}}</label> <select data-form-sync id=\"{{id}}\" name=\"{{id}}\" data-hackone=\"{{hackOneField}}\">{{#options}}<option value=\"{{.}}\">{{.}}</option>{{/options}}</select>";

    // Let's add a ton more here.
    switch(field) {
      case "firstName":
        _field = M.render(inputHtml, { id: field, type: "text", label: "First Name", placeholder: "John", hackOneField: "bio.firstName" });
        break;
      case "lastName":
        _field = M.render(inputHtml, { id: field, type: "text", label: "Last Name", placeholder: "Smith", hackOneField: "bio.lastName" });
        break;
      case "email":
        _field = M.render(inputHtml, { id: field, type: "email", label: "Email Address", placeholder: "email@domain.com", hackOneField: "bio.email" });
        break;
      case "github":
        _field = M.render(inputHtml, { id: field, type: "url", label: "Your GitHub Profile", placeholder: "http://github.com/john", hackOneField: "bio.websites.github" });
        break;
      case "linkedin":
        _field = M.render(inputHtml, { id: field, type: "url", label: "Your LinkedIn Profile", placeholder: "http://www.linkedin.com/in/johnsmith", hackOneField: "bio.websites.linkedin" });
        break;
      case "institution":
        _field = M.render(inputHtml, { id: field, type: "text", label: "University / School", hackOneField: "education.0.institution" });
        break;
      case "reimbursementYesNo":
        _field = M.render(selectHtml, { id: field, label: "Do you want to apply for travel reimbursement?", options: ["Please Select", "Yes, I want to apply!", "No, I do not want travel reimbursement"] });
        break;
      case "dietaryRequirements":
        _field = M.render(inputHtml, { id: field, type: "text", label: "Any dietary requirements?", hackOneField: "bio.dietaryRestrictions" });
        break;
      default:
        _field = M.render(inputHtml, { id: String(field).replace(/ /g, ""), type: "text", label: field });
        break;
    }

    // As this will never return true, it will always be available in library. Woohoo!
    return _field;
  };

  // This is pretty awesome. It allows interaction with Hackathon.js without using JavaScript and instead via HTML tags.
  // Let's make it easy to throw a hackathon regardless of programming experience.
  H.helpers.loadToolsFromDom = function() {
    if(H.dom === true) {
      /**
       * Detect Eventbrite Widget from the DOM.
       *
       * @example
       * <div data-eventbrite="123456789"></div>
       */
      var ebTmp, ebOptions;
      if(typeof (ebTmp = $('[data-eventbrite]')[0]) !== String(H.UNDEF)) {
        ebOptions = H.tools.parseJSON(ebTmp.dataset.eventbriteOptions, { id: ebTmp.dataset.eventbrite || "0" });
        H.loadEventbriteWidget(ebTmp, ebOptions);
      }

      /**
       * Detect Facebook Page from the DOM.
       *
       * @example
       * <div data-facebook="http://www.facebook.com/student">My facebook page has {{likes} likes!</div>
       */
      var fbTmp;
      if(typeof (fbTmp = $('[data-facebook]')[0]) !== String(H.UNDEF)) {
        H.getFacebookPageInfo(fbTmp.dataset.facebook, function(response) {
          fbTmp.innerHTML = M.render(fbTmp.innerHTML, H.tools.mustacheFunctions(response));
        });
      }

      /**
       * Detect Google Analytics from the DOM.
       *
       * @example
       * <div data-googleanalytics="UA-XXXXXXXX-X"></div>
       */
      var gaTmp;
      if(typeof (gaTmp = $('[data-googleanalytics]')[0]) !== String(H.UNDEF)) {
        H.googleAnalytics(gaTmp.dataset.googleanalytics);
      }

      /**
       * Detect Twitter Wall from the DOM.
       *
       * @example
       * <header data-wall>...</div>
       */
      var wallTmp;
      if(typeof (wallTmp = $('[data-wall]')[0]) !== String(H.UNDEF)) {
        H.wall(wallTmp);
      }

      /**
       * Detect HackOne from the DOM.
       *
       * @example
       * <div data-hackone>Hi, {{bio.firstName}} {{bio.lastName}} from {{education.0.institution}}</div>
       */
      var hoTmp;
      if(typeof (hoTmp = $('[data-hackone]')[0]) !== String(H.UNDEF)) {
        hoTmp.dataset.hackonePreviousDisplay = hoTmp.style.display || "block";
        hoTmp.style.display = "none"; // hide it until a successful request is made

        H.hackOneSuccess(function(user) {
          hoTmp.style.display = hoTmp.dataset.hackonePreviousDisplay;
          delete hoTmp.dataset.hackonePreviousDisplay;
          hoTmp.innerHTML = M.render(hoTmp.innerHTML, H.tools.mustacheFunctions(user));
        });
      }

      /**
       * Detect Form Builder from the DOM.
       *
       * @example
       * <div data-form data-form-fields="firstName, lastName"></div>
       */
      var formTmp;
      if((formTmp = $('[data-form]')).length > 0) {
        for(var i = 0; i < formTmp.length; i++) {
          H.formBuilder(formTmp[i]);
        }
      }

      /**
       * Detect Typekit from the DOM.
       *
       * @example
       * <div data-typekit="fpj1avo"></div>
       */
      var tkTmp;
      if(typeof (tkTmp = $('[data-typekit]')[0]) !== String(H.UNDEF)) {
        H.typekit(tkTmp.dataset.typekit); // load typekit
      }

      /**
       * Make persistent data available. Pulls all non-persistent data set via <code>HackathonJS.set()</code>
       *
       * @example
       * // Store in <body data-hackathonjs="true" data-hackathonjs-variables='{ "reimbursement": "up to £40" }'>
       * <div data-parse>We offer up to {{reimbursement}} for travel expenses.</div>
       */
      var varTmp, varTmpItem, varTmpItems, parseTmps;
      if((varTmp = $('body[data-hackathonjs-variables]')).length > 0) {
        varTmpItems = H.tools.parseJSON(varTmp[0].dataset.hackathonjsVariables);

        for(varTmpItem in varTmpItems) {
          H.set(varTmpItem, varTmpItems[varTmpItem]);
        }

        if((parseTmps = $('[data-parse]')).length > 0) {
          for(var i2 = 0; i2 < parseTmps.length; i2++) {
            parseTmps[i2].innerHTML = M.render(parseTmps[i2].innerHTML, H.tools.mustacheFunctions(H.data));
          }
        }
      }

    }

    // Make sure to set true if you only want this to be ran once! 
    return true;
  };

  /**
   * Internal Tool: Get URL parameter(s)
   * @alias HackathonJS.tools.params
   * @param {String}   [param] - Get particular param.
   * @return {String}  Return a string with the value of the parameter key.
   * 
   * @example
   * HackathonJS.tools.params(); // => { "username" => "mike" }
   * HackathonJS.tools.param("username"); // => "mike"
   */
  H.tools.params = H.tools.param = function(param) {
    location.search.substr(1).split("&").forEach(function(item) {
      H.params[item.split("=")[0]] = item.split("=")[1];
    });

    if(typeof param !== String(H.UNDEF)) {
      return H.params[param] || H.UNDEF;
    } else {
      return H.params;
    }
  };

  /**
   * Internal Tool: Parse JSON (for example, inside of HTML attributes)
   * @alias HackathonJS.tools.parseJSON
   * @param {String}   jsonAttribute - Get the JSON asa as String
   * @param {Hash}     [defaults] - If JSON cannot be parsed, what's the default value.
   * @return {Hash}    Parsed JSON, either provided or the defaults.
   * 
   * @example
   * <div id="getLatestTweets" data-tweetOptions='{ "limit": "30" }'>
   * // We want to access the { "limit": 30 } in JavaScript so we can do awesomeness.
   */
  H.tools.parseJSON = function(jsonAttribute, defaults) {
    var _json;
    defaults = defaults || {};

    try {
      _json = JSON.parse(jsonAttribute || "{}");
    }
    catch(err) {
      try {
        _json = JSON.parse("{" + jsonAttribute + "}" || "{}");
      }
      catch(_err) {
        _json = null;
      }
    }

    if(_json !== null && JSON.stringify(_json) !== JSON.stringify({})) {
      return _json;
    } else {
      return defaults;
    }
  };

  /**
   * Internal Tool: Pluralize a word based on its quantity.
   * @alias HackathonJS.tools.params
   * @param {Number}   n - The quantity of the word (i.e. <b>10</b> footballs)
   * @param {String}   word - The word itself in singular form (i.e 10 <b>football</b>)
   * @return {String}  A string containing a pluralized version (i.e. <code>0 footballs</code> or <code>1 football</code>)
   * 
   * @example
   * HackathonJS.tools.pluralize(0, "football"); // => "0 footballs"
   * HackathonJS.tools.pluralize(1, "football");  // => "1 football"
   * HackathonJS.tools.pluralize(10, "football"); // => "10 footballs"
   */
  H.tools.pluralize = function(n, word) {
    return (parseInt(n) === 1) ? (n + " " + word) : (n + " " + word + "s");
  };

  /**
   * Internal Tool: Make an AJAX request via HTTP GET and parse the JSON.
   * @alias HackathonJS.tools.getJSON
   * @param {String}              path - The URL itself you want to make a request to
   * @param {jsonSuccessCallback} [success] - Callback with the JSON response upon success
   * @param {jsonErrorCallback}   [error] - Callback if the request was not successful
   * @return {XHR}                Returns the XMLHTTPRequest object
   * 
   * @example
   * HackathonJS.tools.getJSON("/friends.json", function(response){
   *   console.log(response.friends[0].name); // => "John Smith"
   * }, function(){
   *   alert('An error occurred! This is not cool.');
   * });
   */
  H.tools.getJSON = function(path, success, error) {
    var xhr;

    xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if(xhr.readyState === 4 && xhr.status === 200) {
        return (success || function(){ console.log("HackathonJS getJSON: " + path + " was successful but has no callback."); })(H.tools.parseJSON(xhr.responseText));
      } else if(xhr.readyState === 4) {
        return (error || function(){ console.error("HackathonJS getJSON: " + path + " was unsuccessful but has no callback."); })();
      }
    };

    xhr.open("GET", path, true);
    xhr.send();

    return xhr;
  };

  /**
   * Callback for when a JSON was made and it was successful.
   * @callback jsonSuccessCallback
   * @param {Object} json - The parsed JSON response
   */

  /**
   * Callback for if a JSON request was made but an error occurred.
   * @callback jsonErrorCallback
   */

  /**
   * Internal Tool: Make an AJAX request via HTTP POST and parse the JSON.
   * @alias HackathonJS.tools.postJSON
   * @param {String}              path - The URL itself you want to make a request to
   * @param {Object}              [params={}] An object containing the information to POST.
   * @param {jsonSuccessCallback} [success] - Callback with the JSON response upon success
   * @param {jsonErrorCallback}   [error] - Callback if the request was not successful
   * @return {XHR}                Returns the XMLHTTPRequest object
   * 
   * @example
   * HackathonJS.tools.postJSON("/addFriend.json", {
   *   friend: "John Smith"
   * }, function(response){
   *   alert('You added John as a friend!');
   * }, function(){
   *   alert('An error occurred! John has not been aded.');
   * });
   */
  H.tools.postJSON = function(path, params, success, error) {
    var xhr;
    params = params || {};

    xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if(xhr.readyState === 4 && xhr.status === 200) {
        (success || function(){ console.log("HackathonJS postJSON: " + path + " was successful but has no callback."); })();
      } else if(xhr.readyState === 4) {
        (error || function(){ console.error("HackathonJS postJSON: " + path + " was unsuccessful but has no callback."); })();
      }
    };

    xhr.open("POST", path, true);
    xhr.send(params);

    return xhr;
  };

  /**
   * Internal Tool: Merge two objects together
   * @alias HackathonJS.tools.mergeObjects
   * @param {Object}    a - First object to merge
   * @param {Object}    b - Second object to merge
   * @return {Object}   Returns the merged object
   * 
   * @example
   * HackathonJS.tools.mergeObjects({
   *   name: "John Smith"
   * }, {
   *   age: 10
   * });
   * // => { name: "John Smith", age: 10 }
   */
  H.tools.mergeObjects = function(a, b, c, d, e) {
    var obj, attrName;
    obj = {};

    for(attrName in a) {
      obj[attrName] = a[attrName];
    }

    for(attrName in b) {
      obj[attrName] = b[attrName];
    }

    for(attrName in c) {
      obj[attrName] = c[attrName];
    }

    for(attrName in d) {
      obj[attrName] = d[attrName];
    }

    for(attrName in e) {
      obj[attrName] = e[attrName];
    }

    return obj;
  };

  /**
   * Internal Tool: When dealing with Mustache, this offers a number of additional functions to make Mustache more customizable (i.e. number formatting).
   */
  H.tools.mustacheFunctions = function(a, b) {
    return H.tools.mergeObjects(a, b, {
      // epic number formating to the rescue
      number_format: function() {
        return function (text, render) {
          var _text, _before, _after;
          _text = render(text);
          _before = _text.match(/\d+/g);
          _after = _before.map(function(item){ return String(parseInt(item).format(0)); });

          for(var i = 0; i < _before.length; i++) {
            _text = _text.replace(_before[i], _after[i]);
          }

          return _text;
        };
      }
    });
  };

  /**
   * Internal Tool: Intelligently parses time (in local time) in numerous formats (such as Hash, Array and String).
   *
   * @example
   * // returns Sat Oct 4 2014 10:15:00 GMT+0100 (BST)
   * H.tools.parseTime([10, 4, 2014, 10, 15, 00])
   *
   * @example
   * // returns Mon May 19 2014 00:00:00 GMT+0100 (BST)
   * H.tools.parseTime({ year: 2014, month: "may", day: 19 })
   *
   * @example
   * // returns Mon May 19 2014 00:00:00 GMT+0100 (BST)
   * H.tools.parseTime("19 May 2014 09:00")
   * @returns {Date} Returns a Date object with the parsed time
   */
  H.tools.parseTime = function(time) {
    var result;
    if(time instanceof Object && (typeof (time.month || time.mm || time.m) !== String(H.UNDEF))) {
      time = [
        time.month || time.mm || time.m || 0,
        time.day || time.dd || time.d || 0,
        time.year || time.yy || time.y || 2014,
        time.hours || time.hour || time.hh || time.h || 0,
        time.minutes || time.minute || time.mins || time.min || 0,
        time.seconds || time.second || time.ss || time.s || 0
      ];
    }

    if(time instanceof Array && time.length === 6) {
      // For month, we can accept the month as a string too!
      if(typeof time[0] === "string") {
        time[0] = (["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(time[0].toLowerCase().substr(0, 3)) + 1);
        time[0] = time[0] > 0 && time[0] < 13 ? time[0] : 1;
      }

      result = new Date(Date.parse(time[0] + " " + time[1] + " " + time[2] + " " + time[3] + ":" + time[4] + ":" + time[5]));
    } else if(typeof time === "string") {
      result = new Date(Date.parse(time));
    } else {
      result = new Date(time);
    }

    // Check if invalid time and report to console
    if(String(result) === "Invalid Date") {
      console.error("HackathonJS tools parseTime: Could not parse time '" + (time || "").toString() + "'");
      return H.UNDEF;
    } else {
      return result;
    }
  };

})(Sizzle || jQuery, Mustache, HackathonJS);

// Detect Hackathon.js DOM tags once it has been initialised.
if(typeof jQuery !== String(HackathonJS.UNDEF)) {
  // Go for jQuery, it's way cooler.
  jQuery(document).ready(function(){
    HackathonJS.hack();
  });
} else {
  // Fall back on native. We ain't jQuery-dependent.
  window.addEventListener("load", (function() {
    HackathonJS.hack();
  }));
}