Parse.initialize("9qiSnFq1twgMpo2YcGr1U4kfkyC4mDru6uqK704n", "aT59N4qjCqrE3zh5IfF8bUEpiwEFDRSDnvpQJLWM");  
     var success = false;
 

$('#myForm').submit(function() {
     event.preventDefault();
    // get all the inputs into an array.
    var $inputs = $('#myForm :input');

    // not sure if you wanted this, but I thought I'd add it.
    // get an associative array of just the values.
    var values = {};
    $inputs.each(function() {
        values[this.name] = $(this).val();
    });
     console.log(values);
    var Message = Parse.Object.extend("Message");
    var newMessage = new Message();
    newMessage.set("name",values.name);
    newMessage.set("email",values.email);
    newMessage.set("message",values.message);
    newMessage.save(null, {
  success: function(newMessage) {
    // Execute any logic that should take place after the object is saved.
    alert('message successfully sent');
      success=true;
  },
  error: function(newMessage, error) {
    alert("Message did not send. Please send your message directly to fares@kcltech.com");
    // Execute any logic that should take place if the save fails.
    // error is a Parse.Error with an error code and message.
    console.log('Failed to create new object, with error code: ' + error.message);
  }
        }); 
 });
 window.onerror = function(msg, url, linenumber) {
        alert('Message Not Sent.\nClick Again or contact fares@kcltech.com directly.\nError message: '+msg+'\nURL: '+url+'\nLine Number: '+linenumber);
        return true;
    }
 
function readMoreFAQ(){
    $('#article').readmore({
  speed: 75,
  lessLink: '<a href="#">Read less</a>'
});
}
/*$('.read-more-content').addClass('hide');

// Set up the toggle.
$('.read-more-toggle').on('click', function() {
  $('.read-more-content').toggleClass('hide');
    console.log("hide");
});*/
$('.read-more-toggle').on('click', function() {
  $('.read-more-content').readmore({
  speed: 75,
  lessLink: '<a href="#">Read less</a>'
});
    console.log("hide");
});