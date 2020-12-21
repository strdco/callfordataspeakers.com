var checkedOrganizerRegionCount=0;


/* Housekeeping stuff to do when the page finishes loading */
window.onload = function yeahyeah() {

    // Add a click event to each tab:
    var tabs=document.getElementsByClassName("tab");

    Array.prototype.forEach.call(tabs, function(tab) {
        tab.onclick=tabClicked;
    });



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
