var eventList;
var sessionizeDetails={};
var checkedRegionCount=0;
var checkedEventTypesOk=false;
var checkedPhysicalRegionCount=0;


document.querySelector('form#event-form').addEventListener("submit", postFormEvent);



// Add a click event to each region checkbox on the event page,
// to make sure the organizer doesn't select more than two
// regions:
for (input of document.querySelectorAll(".max-two input[type='checkbox']")) {
    input.addEventListener('click', regionCheckboxClicked);
}


// Make sure the event organizer doesn't check more than two regions.
function regionCheckboxClicked(e) {

    // If we clicked on a physical region, update the counter..
    if (e.target.value!='Virtual') {
        if (e.target.checked) {
            checkedPhysicalRegionCount++;
            checkedRegionCount++;
        } else {
            checkedPhysicalRegionCount--;
            checkedRegionCount--;
        }

        // ... and make sure we haven't selected more than two physical regions:
        if (checkedPhysicalRegionCount>2) {
            e.target.checked=false;
            checkedPhysicalRegionCount--;
            checkedRegionCount--;
        }
    }

    // The total number of regions includes the "Virtual" region:
    if (e.target.value=='Virtual') {
        if (e.target.checked) {
            checkedRegionCount++;
        } else {
            checkedRegionCount--;
        }
    }
}





// How many subscribers do we have for each region?
try {
    fetch('/subscriber-count.json')
        .then(async response => {
            const stats = await response.json();

            // Loop over all labels...
            for(label of document.getElementsByTagName('label')) {

                // ... find subscriber counts for the label...
                const sub_count=stats.find(s => s.name.toLowerCase()===label.innerText.toLowerCase());
                if (sub_count) {
                    // ... and add a counter element
                    var span=document.createElement('span');
                    span.className='subscriber-count';
                    span.innerText=sub_count.subscriber_count;
                    label.appendChild(span);
                }
            }
        });
} catch(err) {
    console.log(err);
}





// Collect a list of all events, so we can detect if a user tries to
// duplicate an existing event
try {
    fetch('/api/events').then(async response => eventList = await response.json());
} catch(err) {
    console.log(err);
}





// Add an "onchange" event to the URL field to trigger the validation
document.querySelector('form input[type="url"]').addEventListener("change", async (e) => {

    const form=document.querySelector("form");
    var url=e.target.value.toLowerCase();

    // Is this URL already found in the event list?
    if (url.includes('sessionize.com/app/')) {
        window.alert('That looks a lot like a private URL. Please revise the Cfs URL.');
        e.target.value='';
    }

    // Is this a VIP link?
    else if (url.includes('sessionize.com/') && url.includes('/?e=')) {
        window.alert('That looks a lot like a VIP link, which would allow people to submit after the CfS has closed. Please correct the URL.');
        e.target.value='';
    }

    // Have we already published this URL?
    else if (eventList.find(event => event.URL.toLowerCase().split("/").join("") === url.split("/").join(""))) {
        window.alert('This event URL has already been published in a call for speakers. Under the terms of this service, you can only announce each event once.');
        e.target.value='';
    }

    // Auto-complete data from Sessionize:
    else if (url.includes('sessionize.com/')) {
        try {
            
            const sessionizeDetails = await fetch("/api/get-sessionize?url="+encodeURIComponent(url)).then(response => response.json());
            // URL
            form.querySelector('#url').classList.remove('inline_error');
            if (sessionizeDetails.URL) { form.querySelector('#url').value=sessionizeDetails.URL; }

            // Event name
            if (sessionizeDetails.EventName) { form.querySelector('#event').value=sessionizeDetails.EventName; }

            // Venue
            if (sessionizeDetails.Venue) { form.querySelector('#venue').value=sessionizeDetails.Venue; }

            // Start date
            if (sessionizeDetails.Date) {
                form.querySelector('#event-date-year').value=sessionizeDetails.Date.substring(0, 4);
                form.querySelector('#event-date-month').value=sessionizeDetails.Date.substring(5, 7);
                form.querySelector('#event-date-day').value=sessionizeDetails.Date.substring(8, 10);
            }

            // End date
            if (sessionizeDetails.EndDate>sessionizeDetails.Date) {
                form.querySelector('#event-end-date-year').value=sessionizeDetails.EndDate.substring(0, 4);
                form.querySelector('#event-end-date-month').value=sessionizeDetails.EndDate.substring(5, 7);
                form.querySelector('#event-end-date-day').value=sessionizeDetails.EndDate.substring(8, 10);
            }

            // How much time left on the call for speakers?
            const cfsHoursRemaining = (sessionizeDetails.Cfs_Closes - new Date().getTime())/(1000*3600);
            if (cfsHoursRemaining < 0) {
                form.querySelector('#url').classList.add('inline_error');
                window.alert('The call for speakers for this event has already closed.');
                e.target.value='';
            }
            else if (cfsHoursRemaining < 24*7) {
                form.querySelector('#url').classList.add('inline_error');
                window.alert('The call for speakers for this event has less than 7 days remaining.\nPlease edit the closing date on Sessionize.com and try again.');
                e.target.value='';
            }
        } catch(err) {
            window.alert('It looks like there\'s something wrong with that Sessionize URL.');
            e.target.value='';
        }
    }
});


