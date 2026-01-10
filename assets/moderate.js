const token=document.location.pathname.split("/")[2];




document.querySelector('form#approve-form').addEventListener("submit", (e) => {
    e.preventDefault();      // Prevents the form from submitting
    e.stopPropagation();     // Avoids bubbling to form submit handlers
});

// Clicking the "Approve" button
document.querySelector('form#approve-form input[name=approve]').addEventListener("click", (e) => {
    form=document.querySelector("form#approve-form");
    form.action="/api/approve/"+token;
    if (postForm(form, e.target)) {
        document.location.pathname="/list";
    } else {
        window.alert("There was a problem posting this event.");
        e.target.disabled=false;
    };
});

// Clicking the "Save" button
document.querySelector('form#approve-form input[name=save]').addEventListener("click", (e) => {
    form=document.querySelector("form#approve-form");
    form.action="/api/update/"+token;

    const res=postForm(form, e.target);
    if (res) { form.querySelector("input[name='approve']").disabled=false; }
    e.target.classList.remove("loading");
});




fetch("/api/event/"+token).then(async response => {

    if (response.status===200) {
        const eventDetails = (await response.json())[0];
        const form=document.querySelector("form#approve-form");

        // Populate the form with values from the database:

        form.querySelector("input#url").value=eventDetails.URL;
        form.querySelector("input#email").value=eventDetails.Email;
        form.querySelector("input#name").value=eventDetails.Name;
        form.querySelector("input#event").value=eventDetails.EventName;
        form.querySelector("input#venue").value=eventDetails.Venue;
        form.querySelector("input#info").value=eventDetails.Information;

        var eventDate=new Date(Date.parse(eventDetails.Date));

        form.querySelector('input#event-date-year').value=eventDate.getUTCFullYear().toString();
        form.querySelector('input#event-date-month').value=(eventDate.getUTCMonth()+1).toString().padStart(2, "0");
        form.querySelector('input#event-date-day').value=eventDate.getUTCDate().toString().padStart(2, "0");

        var endDate=new Date(Date.parse(eventDetails.EndDate));
        if (endDate>0) {
            form.querySelector('input#event-end-date-year').value=endDate.getUTCFullYear().toString();
            form.querySelector('input#event-end-date-month').value=(endDate.getUTCMonth()+1).toString().padStart(2, "0");
            form.querySelector('input#event-end-date-day').value=endDate.getUTCDate().toString().padStart(2, "0");
        }

        eventDetails.Regions.split(",").forEach(region => {
            form.querySelector('input[name="groups"][value="'+region.trim()+'"]').checked=true;
        });

        eventDetails.EventType.split(",").forEach(type => {
            form.querySelector('input[name="types"][value="'+type.trim()+'"]').checked=true;
        });

        // If there's information about a Sessionize event, store those values
        // in the "sessionize" attribute on each input element for comparison:

        if (eventDetails.Sessionize) {
            form.querySelector('input#event').setAttribute('sessionize', eventDetails.Sessionize.name);
            form.querySelector('input#event-date-year').setAttribute('sessionize', eventDetails.Sessionize.eventDates.start.substring(0, 4));
            form.querySelector('input#event-date-month').setAttribute('sessionize', eventDetails.Sessionize.eventDates.start.substring(5, 7));
            form.querySelector('input#event-date-day').setAttribute('sessionize', eventDetails.Sessionize.eventDates.start.substring(8, 10));

            if (eventDetails.Sessionize.isTest) {
                form.querySelector('input#review-cfs').value='WARNING: Event is in test mode!';
                form.querySelector('input#review-cfs').classList.add('mismatches-sessionize');
            } else {
                form.querySelector('input#review-cte').value='UTC '+eventDetails.Sessionize.cfpDates.startUtc.replace('T', ' ').substring(0, 16)+' -> '+eventDetails.Sessionize.cfpDates.endUtc.replace('T', ' ').substring(0, 16);
                if (Date.parse(eventDetails.Sessionize.cfpDates.startUtc)<=Date.now() && Date.parse(eventDetails.Sessionize.cfpDates.endUtc)>=Date.now()) {
                    form.querySelector('input#review-cfs').classList.add('matches-sessionize');
                } else {
                    form.querySelector('input#review-cfs').classList.add('mismatches-sessionize');
                }
            }

            if (eventDetails.Sessionize.eventDates.start!=eventDetails.Sessionize.eventDates.end || form.querySelector('input#event-end-date-day').value!='') {
                form.querySelector('input#event-end-date-year').setAttribute('sessionize', eventDetails.Sessionize.eventDates.end.substring(0, 4));
                form.querySelector('input#event-end-date-month').setAttribute('sessionize', eventDetails.Sessionize.eventDates.end.substring(5, 7));
                form.querySelector('input#event-end-date-day').setAttribute('sessionize', eventDetails.Sessionize.eventDates.end.substring(8, 10));
            }
        }
        
        // Ready to approve, but save button is grayed out until user changes something:
        
        form.querySelector('input.button[name=save]').disabled=true;
        form.querySelector('input.button[name=approve]').disabled=false;
        
        // For each input field...
        form.querySelectorAll('input').forEach(i => {
            
            // Compare its value to that from Sessionize...
            compareSessionize(i);
            
            // ... and add an onchange event to catch any changes made to the field:
            i.addEventListener('change', e => {
                e.target.closest("form").querySelector('input.button[name=save]').disabled=false;
                e.target.closest("form").querySelector('input.button[name=approve]').disabled=true;
                compareSessionize(e.target);
            });
        });
    } else {
        // If we can't load the event details, like if the event has already been sent:
        form.querySelector('input.button[name=save]').disabled=true;
        form.querySelector('input.button[name=approve]').disabled=true;
        window.alert("This event has already been sent.");
    }
});










function compareSessionize(e) {
    if (e.getAttribute('sessionize')) {
        if (e.value==e.getAttribute('sessionize')) {
            e.classList.add('matches-sessionize');
            e.classList.remove('mismatches-sessionize');
        } else {
            e.classList.remove('matches-sessionize');
            e.classList.add('mismatches-sessionize');
        }
    }
}

