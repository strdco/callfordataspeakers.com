var checkedRegionCount=0;
var checkedEventTypesOk=false;
var checkedPhysicalRegionCount=0;








/* Housekeeping stuff to do when the page finishes loading */
window.onload = function yeahyeah() {

/*
    // If there's a Mailchimp submit button, add an event to it that will
    // disable the button when clicked, to avoid duplicate submissions.
    var button=document.getElementById("embedded-subscribe");
    if (button) {

        // Function to re-enable the Submit button in case it was disabled.
        // Used when the user tries to correct an error, in order to allow
        // the user to retry submitting the form.
        function reEnableSubmit() {

            // Set a delay to allow the counter event to fire and update the counter
            // value before proceeding with this event. This feels like a terrible pattern,
            // but don't hate me. Send me a pull request instead.
            setTimeout(function() {
                if (checkedRegionCount>0 && checkedEventTypesOk && document.querySelectorAll('.required[type="checkbox"]:not(:checked)').length==0) {
                    button.classList.remove("submitted");
                    button.disabled=false;
                } else if (document.location.pathname=='/event') {
                    button.classList.add("submitted");
                    button.disabled=true;
                }
            }, 10);
        }

        // On submit, disable the button to prevent double-clicks and other mayhem.
        button.onclick=function(e) {
            // Let the form be submitted before we actually disable the button. :)
            setTimeout(function() {
                e.target.classList.add("submitted");
                e.target.disabled=true;
            }, 50);
        }

        // Add an event listener to each <input> element on the page. If it changes,
        // and the Submit button is disabled, make sure to re-enable the Submit button.
        var allInputs=document.getElementsByTagName('input');
        Array.prototype.forEach.call(allInputs, function(input) {
            if (input.type=='checkbox') {
                input.addEventListener("click", reEnableSubmit);
            } else {
                input.addEventListener("change", reEnableSubmit);
            }
        });

        if (document.location.pathname=='/event') {
            button.classList.add("submitted");
            button.disabled=true;
        }

    }
*/




    // Add a click event to each region checkbox on the event page,
    // to make sure the organizer doesn't select more than two
    // regions:
    Array.from(document.querySelectorAll(".max-two input[type='checkbox']")).forEach(input => {
        input.addEventListener('click', regionCheckboxClicked);
    });


    // Add an onclick event for the event type checkboxes, so we
    // can validate them when clicked.

    Array.from(document.querySelectorAll(".event-type input[type='checkbox']")).forEach(input => {
        input.addEventListener('click', eventTypeClicked);
    });


}

/* Validate selected event types */

function eventTypeClicked(e) {
    const selectedTypes = Array.from(document.querySelectorAll('input[name="TYPE"]'))
        .reduce((acc, checkbox) => {
            acc[checkbox.value] = checkbox.checked;
            return acc;
            }, {});

    checkedEventTypesOk=
        selectedTypes.Conference ||
        selectedTypes.Precon ||
        selectedTypes.Usergroup;

    if ((selectedTypes.Conference || selectedTypes.Precon) && selectedTypes.Usergroup) {
        checkedEventTypesOk=false;
    }
}

/* Make sure the event organizer doesn't check more than two regions. */
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
