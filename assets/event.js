var eventList;
var sessionizeDetails={};








/* Housekeeping stuff to do when the page finishes loading */
window.onload = function yeahyeah() {


    // If this is the event page
    if (document.location.pathname=='/event') {

        // ... collect the subscriber count for each region:
        var xhr1 = new XMLHttpRequest();
    
        xhr1.onload = function() {
            if (xhr1.status == 200) {
                try {
                    var groups=JSON.parse(xhr1.response);
                    
                    Array.prototype.forEach.call(document.getElementsByTagName('label'), function(label) {
                        groups.forEach(group => {
                            if (label.innerText.replace('-', '').replace(' ', '').toUpperCase()==group.name.toUpperCase().replace('-', '').replace(' ', '')) {
                                var span=document.createElement('span');
                                span.className='subscriber-count';
                                span.innerText=group.subscriber_count;
                                label.appendChild(span);
                            }
                        });
                    });
                } catch(err) {
                    // No big deal.
                    console.log(err);
                }
            }
        }

        xhr1.open('GET', '/assets/subscriber-count.json');
        xhr1.send();

        // ... and collect a list of existing events, in order to prevent duplicate
        // event registrations:
        var xhr3 = new XMLHttpRequest();

        xhr3.onload = function() {
            if (xhr3.status == 200) {
                eventList = JSON.parse(xhr3.response);
            }
        };

        xhr3.open('GET', '/api/events');
        xhr3.send();

        // Add an "onchange" event to the URL field to trigger the validation
        document.querySelector('form input[type="url"]').addEventListener("change", function(e) {
            var url=e.target.value.toLowerCase();

            if (url.includes('sessionize.com/')) {
                var xhr4 = new XMLHttpRequest();
                xhr4.onload= function() {
                    if (xhr4.status==200) {
                        try {
                            const sessionizeDetails=JSON.parse(xhr4.response);
                            document.querySelector('form input#mce-URL').classList.remove('mce_inline_error');
                            if (sessionizeDetails.URL) { document.querySelector('form input#mce-URL').value=sessionizeDetails.URL; }
                            if (sessionizeDetails.EventName) { document.querySelector('form input#mce-EVENT').value=sessionizeDetails.EventName; }
                            if (sessionizeDetails.Venue) { document.querySelector('form input#mce-VENUE').value=sessionizeDetails.Venue; }
                            if (sessionizeDetails.Date) {
                                document.querySelector('form input#mce-EVENTDATE-year').value=sessionizeDetails.Date.substring(0, 4);
                                document.querySelector('form input#mce-EVENTDATE-month').value=sessionizeDetails.Date.substring(5, 7);
                                document.querySelector('form input#mce-EVENTDATE-day').value=sessionizeDetails.Date.substring(8, 10);
                            }
                            if (sessionizeDetails.EndDate>sessionizeDetails.Date) {
                                document.querySelector('form input#mce-EVENTENDDATE-year').value=sessionizeDetails.EndDate.substring(0, 4);
                                document.querySelector('form input#mce-EVENTENDDATE-month').value=sessionizeDetails.EndDate.substring(5, 7);
                                document.querySelector('form input#mce-EVENTENDDATE-day').value=sessionizeDetails.EndDate.substring(8, 10);
                            }

                            const cfsHoursRemaining = (sessionizeDetails.Cfs_Closes - new Date().getTime())/(1000*3600);
                            if (cfsHoursRemaining < 0) {
                                document.querySelector('form input#mce-URL').classList.add('mce_inline_error');
                                window.alert('The call for speakers for this event has already closed.');
                                e.target.value='';
                            }
                            else if (cfsHoursRemaining < 24*7) {
                                document.querySelector('form input#mce-URL').classList.add('mce_inline_error');
                                window.alert('The call for speakers for this event has less than 7 days remaining.\nPlease edit the closing date on Sessionize.com and try again.');
                                e.target.value='';
                            }
                        } catch(e) {}
                    }

                    if (xhr4.status==404) {
                        document.querySelector('form input#mce-URL').classList.add('mce_inline_error');
                        window.alert('That Sessionize URL returned a 404 (not found).\nHave you entered the correct URL?\nDid you remember to publish your Sessionize event?');
                    }
                };
                xhr4.open('GET', '/api/get-sessionize?url='+encodeURIComponent(url));
                xhr4.send();
            }

            // Is this URL already found in the event list?

            if (url.includes('sessionize.com/app/')) {
                window.alert('That looks a lot like a private URL. Please revise the Cfs URL.');
                e.target.value='';
            }

            if (url.includes('sessionize.com/') && url.includes('/?e=')) {
                window.alert('That looks a lot like a VIP link, which would allow people to submit after the CfS has closed. Please correct the URL.');
                e.target.value='';
            }

            if (eventList.find(event => event.URL.toLowerCase() === url)) {
                window.alert('This event URL has already been published in a call for speakers. Under the terms of this service, you can only announce each event once.');
                e.target.value='';
            }
        });

    }

}
