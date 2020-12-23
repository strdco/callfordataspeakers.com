var checkedOrganizerRegionCount=0;


/* Housekeeping stuff to do when the page finishes loading */
window.onload = function yeahyeah() {

    // If there's a Mailchimp submit button, add an event to it that will
    // disable the button when clicked, to avoid duplicate submissions.
    var button=document.getElementById("mc-embedded-subscribe");
    if (button) {
        button.onclick=function(e) {
            // Let the form be submitted before we actually disable the button. :)
            setTimeout(function() {
                e.target.classList.add("submitted");
                e.target.disabled=true;
            }, 200);
        }
    }



    // If this is the "List Events" page, populate the table using the REST API:
    var eventstbl=document.getElementById("eventstbl");
    if (eventstbl) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/events');
        xhr.send();

        xhr.onload = function() {
            if (xhr.status == 200) {
                var rs = JSON.parse(xhr.response);
                console.log(rs);

                rs.forEach(row => {
                    var tr=document.createElement('tr');

                    var td1=document.createElement('td');
                    td1.innerText = new Date(row.Date).toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    tr.appendChild(td1);

                    var td2=document.createElement('td');
                    var a=document.createElement('a');
                    a.href=row.URL;
                    a.innerText = row.EventName;
                    a.target='_blank';
                    td2.appendChild(a);
                    tr.appendChild(td2);

                    var td3=document.createElement('td');
                    td3.innerText=row.Venue;
                    tr.appendChild(td3);

                    eventstbl.appendChild(tr);
                });
            }
        }

    }




    // Add a click event to each region checkbox on the event page,
    // to make sure the organizer doesn't select more than two
    // regions:
    var maxTwo=document.getElementsByClassName("max-two");
    
    Array.prototype.forEach.call(maxTwo, function(e) {
        var inputs=e.getElementsByTagName("input");
        Array.prototype.forEach.call(inputs, function(input) {
            if (input.type=='checkbox' && input.value!='Virtual') {
                input.onclick=organizerRegionCheckboxClicked;
            }
        });
    });

}

/* Make sure the event organizer doesn't check more than two regions. */
function organizerRegionCheckboxClicked(e) {
    if (e.srcElement.checked) {
        checkedOrganizerRegionCount++;
    } else {
        checkedOrganizerRegionCount--;
    }

    if (checkedOrganizerRegionCount>2) {
        e.srcElement.checked=false;
        checkedOrganizerRegionCount--;
    }
}

/* When clicking a tab */
function tabClicked(e) {
    var tab=e.srcElement;
    var page=document.getElementById(e.srcElement.id.replace("tab", "page"));

    document.getElementsByClassName("tab selected")[0].classList.remove("selected");
    tab.classList.add("selected");

    // Tab 1: Speaker registration
    if (tab.id=='tab1') {
        document.location='/';
    }

    // Tab 2: Event registration
    if (tab.id=='tab2') {
        document.location='/event';
    }

}
