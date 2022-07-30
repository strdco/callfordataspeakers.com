var checkedRegionCount=0;
var checkedPhysicalRegionCount=0;
var searchInput;
var searchTimeout;
var preconSpeakers;

/* Housekeeping stuff to do when the page finishes loading */
window.onload = function yeahyeah() {

    // If there's a Mailchimp submit button, add an event to it that will
    // disable the button when clicked, to avoid duplicate submissions.
    var button=document.getElementById("mc-embedded-subscribe");
    if (button) {

        // Function to re-enable the Submit button in case it was disabled.
        // Used when the user tries to correct an error, in order to allow
        // the user to retry submitting the form.
        function reEnableSubmit() {

            // Set a delay to allow the counter event to fire and update the counter
            // value before proceeding with this event. This feels like a terrible pattern,
            // but don't hate me. Send me a pull request instead.
            setTimeout(function() {
                if (checkedRegionCount>0) {
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


    // If this is the event page, collect the subscriber count for each region:
    if (document.location.pathname=='/event') {
        var xhr1 = new XMLHttpRequest();
        xhr1.open('GET', '/assets/subscriber-count.json');
        xhr1.send();
    
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
    }


    // If there's a "counter" element in the footer (or anywhere on the page), collect
    // the number of campaigns and emails sent and update the counter text:
    var p_counter=document.body.querySelector('#counter');
    if (p_counter) {
        var xhr2 = new XMLHttpRequest();
        xhr2.open('GET', '/assets/campaign-count.json');
        xhr2.send();
    
        xhr2.onload = function() {
            if (xhr2.status == 200) {
                try {
                    var stats=JSON.parse(xhr2.response);
                    p_counter.innerHTML= 'We\'ve sent '+stats.emails+' call for speaker emails for '+stats.campaigns+' events so far!';
                } catch(err) {
                    // Who cares.
                    console.log(err);
                }
            }
        }

    }




    // If this is the "List Events" page, populate the table using the REST API:
    var eventstbl=document.getElementById("eventstbl");
    if (eventstbl) {
        var tbody = eventstbl.getElementsByTagName("tbody")[0];

        var xhr3 = new XMLHttpRequest();
        xhr3.open('GET', '/api/events');
        xhr3.send();

        xhr3.onload = function() {
            if (xhr3.status == 200) {
                var rs = JSON.parse(xhr3.response);

                rs.forEach(row => {
                    var tr=document.createElement('tr');

                    var td1=document.createElement('td');
                    td1.innerText = new Date(row.Date).toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

                    // Add an information badge for when the Cfs closes:
                    if (row.Cfs_Closes!=null) {
                        var span=document.createElement('span');
                        span.className='cfs-closes-in';
                        span.title=new Date(row.Cfs_Closes).toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

                        var closesInDays=(new Date(row.Cfs_Closes)-new Date())/(1000*3600*24);
                        if (closesInDays<0) {
                            span.classList.add('closed');
                            span.innerText='Closed';
                        } else if (closesInDays<3) {
                            span.classList.add('soon');
                            span.innerText=Math.round(closesInDays*24).toString()+' hours';
                        } else {
                            span.innerText=Math.round(closesInDays).toString()+' days';
                        }
                        td1.appendChild(span);
                    }
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

                    tbody.appendChild(tr);
                });
            }
        }

    }





    // If this is the "Precon Speakers" page, populate the table from the Github URL:
    var precontbl=document.getElementById("precontbl");
    if (precontbl) {
        var tbody = precontbl.getElementsByTagName("tbody")[0];
        searchInput=document.getElementById("search");

        function clickKeyword(e) {
            var s=e.srcElement.innerText;
            if (searchInput.value.toLowerCase().indexOf(s)==-1) {
                searchInput.value+=(searchInput.value ? ', ' : '')+s;
            }
            searchChangedEvent();
        }

        // Filter the table with the search criteria:
        function renderTable() {

            // Add rows matching the search criteria:
            preconSpeakers.forEach(row => {
                var tr=document.createElement('tr');

                try {
                    var td1=document.createElement('td');
                    if (row.sessionize) {
                        var url=row.sessionize.toLowerCase();

                        if (url.indexOf('sessionize.com/')==-1) { url='https://sessionize.com/'+url; }
                        if (url.indexOf('https://')==-1) { url='https://'+url; }

                        var a=document.createElement('a');
                        a.href=url;
                        a.innerText = row.name;
                        a.target='_blank';
                        td1.appendChild(a);
                    } else {
                        td1.innerText = row.name;
                    }
                    tr.appendChild(td1);

                    var td2=document.createElement('td');
                    row.topics.toLowerCase().split(',').sort().forEach(topic => {
                        var span=document.createElement('span');
                        span.classList.add('badge');
                        span.classList.add('topic');
                        span.innerText=topic.trim();
                        span.addEventListener('click', clickKeyword);
                        td2.appendChild(span);
                    });
                    tr.appendChild(td2);

                    var td3=document.createElement('td');
                    row.regions.split(',').forEach(region => {
                        var span=document.createElement('span');
                        span.classList.add('badge');
                        span.classList.add('region');
                        span.innerText=region.trim();
                        span.addEventListener('click', clickKeyword);
                        td3.appendChild(span);
                    });
                    tr.appendChild(td3);

                    var td4=document.createElement('td');
                    row.language.split(',').forEach(lang => {
                        lang = lang.trim();

                        var span=document.createElement('span');
                        span.classList.add('badge');
                        span.classList.add('language');
                        span.innerText=lang.substring(0, 1).toUpperCase()+
                                       lang.substring(1, 99).toLowerCase();
                        span.addEventListener('click', clickKeyword);
                        td4.appendChild(span);
                    });
                    tr.appendChild(td4);
                } catch(e) {
                    console.log(e);

                    var td1=document.createElement('td');
                    td1.colSpan=3;
                    td1.innerText="(Error rendering JSON element)";
                    tr.appendChild(td1);
                }

                tbody.appendChild(tr);
            });
        }

        function filterTable() {
            var matched=true;
            var searchCriteria=searchInput.value.toLowerCase().replace(/ /g, '').split(',');

            Array.from(tbody.getElementsByTagName('tr')).forEach(tr => {
                matched=(searchInput.value=='' ? true : false);

                if(tr.children[0].tagName.toLowerCase()=='td') {
                    if (searchCriteria.find(c => tr.innerText.toLowerCase().replace(/ /g, '').indexOf(c.trim())>=0)) { matched=true; }
                    tr.style.display=(matched ? 'table-row' : 'none');
                };
            });
        }

        // Reset the timer to 500 ms. When the timer reaches 0, refresh the search.
        function searchChangedEvent(e) {
            clearTimeout(searchTimeout);
            searchTimeout=setTimeout(filterTable, 500);
        }

        // If there's a keystroke or something in the search bar's value changes,
        // call the event handler function:
        searchInput.addEventListener("change", searchChangedEvent);
        searchInput.addEventListener("keyup", searchChangedEvent);

        var xhr3 = new XMLHttpRequest();
        xhr3.open('GET', 'https://raw.githubusercontent.com/dataplat/DataSpeakers/main/website/speaker-list.json');
        xhr3.send();

        xhr3.onload = function() {
            if (xhr3.status == 200) {
                preconSpeakers = JSON.parse(xhr3.response);
                renderTable();
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
            if (input.type=='checkbox') {
                input.onclick=regionCheckboxClicked;
            }
        });
    });

}

/* Make sure the event organizer doesn't check more than two regions. */
function regionCheckboxClicked(e) {

    // If we clicked on a physical region, update the counter..
    if (e.srcElement.value!='Virtual') {
        if (e.srcElement.checked) {
            checkedPhysicalRegionCount++;
            checkedRegionCount++;
        } else {
            checkedPhysicalRegionCount--;
            checkedRegionCount--;
        }

        // ... and make sure we haven't selected more than two physical regions:
        if (checkedPhysicalRegionCount>2) {
            e.srcElement.checked=false;
            checkedPhysicalRegionCount--;
            checkedRegionCount--;
        }
    }

    // The total number of regions includes the "Virtual" region:
    if (e.srcElement.value=='Virtual') {
        if (e.srcElement.checked) {
            checkedRegionCount++;
        } else {
            checkedRegionCount--;
        }
    }
}
