var checkedRegionCount=0;
var checkedEventTypesOk=false;
var checkedPhysicalRegionCount=0;
var searchInput;
var searchTimeout;
var preconSpeakers;
var eventList;
var timeoutHandler;
var rangeFrom;
var rangeTo;
var searchString;
var includeClosed=true;
var listOfEvents=[];
var sessionizeDetails={};








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


    // This is the moderation interface - fetch a single event's details and
    // populate the form with that information.
    if (document.location.pathname.substring(0, 10)=='/moderate/') {
        var token=document.location.pathname.substring(10, 46);
        var xhr3 = new XMLHttpRequest();

        xhr3.onload = function() {
            if (xhr3.status == 200) {
                const eventDetails = JSON.parse(xhr3.response)[0];
                const form=document.querySelector('form');

                form.querySelector('#mce-EMAIL').value=eventDetails.Email;
                form.querySelector('#mce-NAME').value=eventDetails.Name;
                form.querySelector('#mce-EVENT').value=eventDetails.EventName;
                form.querySelector('#mce-VENUE').value=eventDetails.Venue;

                var eventDate=new Date(Date.parse(eventDetails.Date));

                form.querySelector('#mce-EVENTDATE-year').value=eventDate.getUTCFullYear();
                form.querySelector('#mce-EVENTDATE-month').value=eventDate.getUTCMonth()+1;
                form.querySelector('#mce-EVENTDATE-day').value=eventDate.getUTCDate();

                var endDate=new Date(Date.parse(eventDetails.EndDate));
                if (endDate>0) {
                    form.querySelector('#mce-EVENTENDDATE-year').value=endDate.getUTCFullYear();
                    form.querySelector('#mce-EVENTENDDATE-month').value=endDate.getUTCMonth()+1;
                    form.querySelector('#mce-EVENTENDDATE-day').value=endDate.getUTCDate();
                }

                form.querySelector('#mce-URL').value=eventDetails.URL;
                form.querySelector('#mce-INFO').value=eventDetails.Information;

                eventDetails.Regions.split(',').forEach(region => {
                    form.querySelector('input[name=REGION][value="'+region.trim()+'"]').checked=true;
                });

                eventDetails.EventType.split(',').forEach(type => {
                    form.querySelector('input[name=TYPE][value="'+type.trim()+'"]').checked=true;
                });



                // If there's a matching Sessionize event, store those properties here for comparison:
                if (eventDetails.Sessionize) {
                    form.querySelector('#mce-EVENT').setAttribute('sessionize', eventDetails.Sessionize.name);
                    form.querySelector('#mce-EVENTDATE-year').setAttribute('sessionize', eventDetails.Sessionize.eventDates.start.substring(0, 4));
                    form.querySelector('#mce-EVENTDATE-month').setAttribute('sessionize', Number(eventDetails.Sessionize.eventDates.start.substring(5, 7)));
                    form.querySelector('#mce-EVENTDATE-day').setAttribute('sessionize', Number(eventDetails.Sessionize.eventDates.start.substring(8, 10)));
                    if (eventDetails.Sessionize.isTest) {
                        form.querySelector('#review-CFS').value='WARNING: Event is in test mode!';
                        form.querySelector('#review-CFS').classList.add('mismatches-sessionize');
                    } else {
                        form.querySelector('#review-CFS').value='UTC '+eventDetails.Sessionize.cfpDates.startUtc.replace('T', ' ').substring(0, 16)+' -> '+eventDetails.Sessionize.cfpDates.endUtc.replace('T', ' ').substring(0, 16);
                        if (Date.parse(eventDetails.Sessionize.cfpDates.startUtc)<=Date.now() && Date.parse(eventDetails.Sessionize.cfpDates.endUtc)>=Date.now()) {
                            form.querySelector('#review-CFS').classList.add('matches-sessionize');
                        } else {
                            form.querySelector('#review-CFS').classList.add('mismatches-sessionize');
                        }
                    }

                    if (eventDetails.Sessionize.eventDates.start!=eventDetails.Sessionize.eventDates.end || form.querySelector('#mce-EVENTENDDATE-day').value!='') {
                        form.querySelector('#mce-EVENTENDDATE-year').setAttribute('sessionize', eventDetails.Sessionize.eventDates.end.substring(0, 4));
                        form.querySelector('#mce-EVENTENDDATE-month').setAttribute('sessionize', eventDetails.Sessionize.eventDates.end.substring(5, 7));
                        form.querySelector('#mce-EVENTENDDATE-day').setAttribute('sessionize', eventDetails.Sessionize.eventDates.end.substring(8, 10));
                    }
                }




                document.querySelector('form #mc-embedded-subscribe[name=save]').classList.add('submitted');
                document.querySelector('form #mc-embedded-subscribe[name=save]').disabled=true;
                document.querySelector('form #mc-embedded-subscribe[name=approve]').classList.remove('submitted');
                document.querySelector('form #mc-embedded-subscribe[name=approve]').disabled=false;

                form.querySelectorAll('input').forEach(i => {
                    compareSessionize(i);

                    i.addEventListener('change', e => {
                        document.querySelector('form #mc-embedded-subscribe[name=save]').classList.remove('submitted');
                        document.querySelector('form #mc-embedded-subscribe[name=save]').disabled=false;
                        document.querySelector('form #mc-embedded-subscribe[name=approve]').classList.add('submitted');
                        document.querySelector('form #mc-embedded-subscribe[name=approve]').disabled=true;
                        compareSessionize(e.target);
                    });
                });

                // Save button
                document.querySelector('form #mc-embedded-subscribe[name=save]').addEventListener('click', (e) => {
                    var xhr4 = new XMLHttpRequest();
                    xhr4.onload = function() {
                        if (xhr4.status == 200) {
                            document.querySelector('form #mc-embedded-subscribe[name=save]').classList.add('submitted');
                            document.querySelector('form #mc-embedded-subscribe[name=save]').disabled=true;
                            document.querySelector('form #mc-embedded-subscribe[name=approve]').classList.remove('submitted');
                            document.querySelector('form #mc-embedded-subscribe[name=approve]').disabled=false;
                        } else {
                            console.log('NOPE');
                        }
                    };

                    var data={};
                    // For each <input> element whose name either starts with "mce"
                    // or is a checkbox that has been checked
                    Array.from(form.querySelectorAll('input[id^=mce], input[type=checkbox]:checked')).forEach(i => {
                        if (i.type=='checkbox') {
                            if (i.checked) {
                                if (data[i.name]) {
                                    data[i.name]+=','+i.value;
                                } else {
                                    data[i.name]=i.value;
                                }
                            }
                        } else {
                            data[i.name]=i.value;
                        }
                    });

                    xhr4.open('POST', '/api/update/'+token);
                    xhr4.setRequestHeader("Content-Type", "application/json");
                    xhr4.send(JSON.stringify(data));
                });

                // Approve button
                document.querySelector('form #mc-embedded-subscribe[name=approve]').addEventListener('click', (e) => {
                    document.querySelector('form #mc-embedded-subscribe[name=approve]').classList.add('submitted');
                    document.querySelector('form #mc-embedded-subscribe[name=approve]').disabled=true;
                    document.location.href='/approve/'+token;
                });
            }
        };

        xhr3.open('GET', '/api/event/'+token);
        xhr3.send();
    }




    // If there's a "counter" element in the footer (or anywhere on the page), collect
    // the number of campaigns and emails sent and update the counter text:
    var p_counter=document.body.querySelector('#counter');
    if (p_counter) {
        var xhr2 = new XMLHttpRequest();
    
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

        xhr2.open('GET', '/assets/campaign-count.json');
        xhr2.send();
    }




    // If this is the "List Events" page, populate the table using the REST API:
    var eventstbl=document.getElementById("eventstbl");
    if (eventstbl) {
        var xhr3 = new XMLHttpRequest();
        xhr3.onload = function() {
            if (xhr3.status == 200) {
                listOfEvents = JSON.parse(xhr3.response);

                for (n=0; n<listOfEvents.length; n++) {
                    if (listOfEvents[n].Cfs_Closes) {
                        var closesInDays=(new Date(listOfEvents[n].Cfs_Closes)-new Date())/(1000*3600*24);
                        listOfEvents[n].closed = (closesInDays<0);
                    }
                }

                renderList();
            }
        }
        xhr3.open('GET', '/api/events');
        xhr3.send();

        updateSliderDates();

        document.querySelectorAll('div.filterpane input[type=range], div.filterpane input#closed[type=checkbox]').forEach(input => {
            input.addEventListener('input', delayListUpdate);
        });

        document.querySelector('div.filterpane input#map').addEventListener('input', (e) => {
            document.querySelector('.worldmap').style.display=(e.target.checked ? 'block' : 'none');
        });

        document.querySelectorAll('div.filterpane input#search').forEach(input => {
            input.addEventListener('keyup', delayListUpdate);
        });

        function delayListUpdate(e) {
            updateSliderDates();

            if (timeoutHandler) { clearTimeout(timeoutHandler); }
            timeoutHandler=setTimeout(() => {
                renderList();
            }, 250);
        }

        function updateSliderDates() {
            var filterpane=document.querySelector('div.filterpane');
            var inputs=filterpane.querySelectorAll('input[type=range]');
            var chkboxes=filterpane.querySelectorAll('input[type=checkbox]');
            searchString=(filterpane.querySelector('input#search').value || '').toLowerCase().split(' ').join('');
            var dateLabels=filterpane.querySelectorAll('.slider-date');

            rangeFrom=Date.now()-Number(inputs[0].value)*24*3600000;
            rangeTo  =Date.now()+Number(inputs[1].value)*24*3600000;
    
            dateLabels[0].innerText=new Date(rangeFrom).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
            dateLabels[1].innerText=new Date(rangeTo).toLocaleDateString("en-US", { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

            includeClosed=chkboxes[0].checked;
        }



        function plotMapPoint(mapContainer, lat, long, cssClass, title) {

            const coords = projectAbsolute(lat, long, 100, 0.52, 0, 0);
            var dot=document.createElement('div');
            dot.classList.add('dot');
            if (cssClass) { dot.classList.add(cssClass); }
            dot.style.marginLeft=(1.02*coords.x-2).toString()+'%'; // (99*(long+180)/360-3).toString()+'%';
            dot.style.marginTop=(2*coords.y-1.5).toString()+'%'; // (59*(90-lat)/180-1.5).toString()+'%';
            dot.setAttribute('data-event-title', title);
            mapContainer.appendChild(dot);
        }




        function renderList() {
            var tbody = eventstbl.getElementsByTagName("tbody")[0];
            var mapContainer=document.querySelector('.worldmap');

            mapContainer.querySelectorAll('.dot').forEach(e => {
                e.remove();
            });

            while (tbody.firstChild) {
                tbody.removeChild(tbody.firstChild);
            }

            listOfEvents.filter(r =>
                    // Search criteria:
                    new Date(r.EndDate || r.Date)>=rangeFrom &&
                    new Date(r.Date)<=rangeTo &&
                    (includeClosed==true || includeClosed==false && r.closed!=true) &&
                    (searchString=='' || (r.EventName+';'+r.EventType+';'+r.Regions+';'+r.Venue+';'+r.Information).toLowerCase().split(' ').join('').indexOf(searchString)>-1)
                ).forEach(row => {

                var mapPointCss='';

                var tr=document.createElement('tr');

                var td1=document.createElement('td');
                var fromDate=new Date(row.Date);
                var toDate=new Date(row.EndDate);
                if (toDate-new Date(0)==0) { toDate=fromDate; }

                if (toDate-fromDate==0) {
                    td1.innerText = fromDate.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
                }
                else {
                    // Same year, same month:
                    if (toDate.getFullYear()==fromDate.getFullYear() && toDate.getMonth()==fromDate.getMonth()) {
                        td1.innerText = fromDate.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).replace(' '+fromDate.getUTCDate()+', ', ' '+fromDate.getUTCDate()+'-'+toDate.getUTCDate()+', ');
                    }
                    // Same year, spans two months:
                    else if (toDate.getFullYear()==fromDate.getFullYear() && toDate.getMonth()==fromDate.getMonth()+1) {
                        td1.innerText = fromDate.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).replace(', '+fromDate.getFullYear(), '')+' - '+
                                        toDate.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
                    }
                    // Same year, spans multiple months:
                    else if (toDate.getFullYear()==fromDate.getFullYear()) {
                        td1.innerText = fromDate.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).replace(', '+fromDate.getFullYear(), '').replace(' '+fromDate.getUTCDate(), '')+' - '+
                                        toDate.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).replace(' '+toDate.getUTCDate(), '');
                    }
                    // Not even same year:
                    else {
                        td1.innerText = fromDate.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })+' - '+
                                        toDate.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
                    }
                }

                // Add an information badge for when the Cfs closes:
                if (row.Cfs_Closes!=null) {
                    var span=document.createElement('span');
                    span.className='cfs-closes-in';
                    span.title=new Date(row.Cfs_Closes).toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

                    var closesInDays=(new Date(row.Cfs_Closes)-new Date())/(1000*3600*24);
                    if (closesInDays<0) {
                        mapPointCss='closed';
                        span.classList.add('closed');
                        span.innerText='Closed';
                    } else if (closesInDays<3) {
                        mapPointCss='soon';
                        span.classList.add('soon');
                        span.innerText=Math.round(closesInDays*24).toString()+' hours';
                    } else if (closesInDays<60) {
                        span.innerText=Math.round(closesInDays).toString()+' days';
                    } else {
                        span.innerText='Open';
                    }
                    td1.appendChild(span);
                }
                tr.appendChild(td1);

                var td2=document.createElement('td');
                row.EventType.split(',').forEach(eventType => {
                    if (eventType.trim()!='')
                    var badge=document.createElement('span');
                    badge.classList.add('event-type');
                    switch (eventType.trim().toLowerCase()) {
/*                      case "paid":
                            badge.classList.add('paid');
                            badge.innerText='$';
                            badge.title='Paid engagement';
                            break; */
                        case "conference":
                            badge.classList.add('conference');
                            badge.innerText='C';
                            badge.title='Conference';
                            break;
                        case "precon":
                            badge.classList.add('precon');
                            badge.innerText='P';
                            badge.title='Precon';
                            break;
                        case "usergroup":
                            badge.classList.add('usergroup');
                            badge.innerText='U';
                            badge.title='Usergroup';
                            break;
                    }
                    td2.appendChild(badge);
                });

                var a=document.createElement('a');
                a.href=row.URL;
                if (row.URL.toLowerCase().indexOf('sessionize.com')>=0) {
                    if (row.URL.toLowerCase().indexOf('utm_source')==-1) {
                        a.href=row.URL+(row.URL.indexOf('?')==-1 ? '?' : '&')+'utm_source=callfordataspeakers&utm_campaign=list-of-events';
                    }
                }
                a.innerText = row.EventName;
                a.target='_blank';

                if (row.EventName.toLowerCase().split(' ').join('').includes('sqlsat')) {
                    a.classList.add('sqlsaturday');
                }
                if (row.EventName.toLowerCase().split(' ').join('').includes('datasat')) {
                    a.classList.add('datasaturday');
                }

                td2.appendChild(a);
                tr.appendChild(td2);

                var td3=document.createElement('td');
                td3.innerText=row.Venue;
                tr.appendChild(td3);

                tbody.appendChild(tr);

                // Add a point to the map:
                if (row.Lat && row.Long) {
                    plotMapPoint(mapContainer, row.Lat, row.Long, mapPointCss, row.EventName);
                }

            });

        }
    }





    // If this is the "Precon Speakers" page, populate the table from the Github URL:
    var precontbl=document.getElementById("precontbl");
    if (precontbl) {
        var tbody = precontbl.getElementsByTagName("tbody")[0];
        searchInput=document.getElementById("search");

        function clickKeyword(e) {
            var s=e.target.innerText;
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
                    row.topics.toLowerCase().split(',').filter(t => t.trim()!='').sort().forEach(topic => {
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

        xhr3.onload = function() {
            if (xhr3.status == 200) {
                preconSpeakers = JSON.parse(xhr3.response);
                renderTable();
            }
        }

        xhr3.open('GET', 'https://raw.githubusercontent.com/dataplat/DataSpeakers/main/website/speaker-list.json');
        xhr3.send();
    }








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







// Thank you, https://gist.github.com/gr8bit/172584afeb738fd864d572b7cfbcc14d

var robinsonAA = [
    0.84870000,    0.84751182,    0.84479598,    0.84021300,    0.83359314,    0.82578510,    0.81475200,    0.80006949,
    0.78216192,    0.76060494,    0.73658673,    0.70866450,    0.67777182,    0.64475739,    0.60987582,    0.57134484,
    0.52729731,    0.48562614,    0.45167814];
var robinsonBB = [
    0.00000000,    0.08384260,    0.16768520,    0.25152780,    0.33537040,    0.41921300,    0.50305560,    0.58689820,
    0.67047034,    0.75336633,    0.83518048,    0.91537187,    0.99339958,    1.06872269,    1.14066505,    1.20841528,
    1.27035062,    1.31998003,    1.35230000];

function project(latitude, longitude, mapWidth, heightFactor, mapOffsetX, mapOffsetY) {
    if (typeof heightFactor === 'undefined') { heightFactor = 1; }
    if (typeof mapOffsetX === 'undefined') { mapOffsetX = 0; }
    if (typeof mapOffsetY === 'undefined') { mapOffsetY = 0; }

    // Robinson's latitude interpolation points are in 5-degree-steps
    var latitudeAbs = Math.abs(latitude);
    var latitudeStepFloor = Math.floor(latitudeAbs / 5);
    var latitudeStepCeil = Math.ceil(latitudeAbs / 5);
    // calc interpolation factor (>=0 to <1) between two steps
    var latitudeInterpolation = (latitudeAbs - latitudeStepFloor * 5) / 5;

    // interpolate robinson table values
    var AA = robinsonAA[latitudeStepFloor] + (robinsonAA[latitudeStepCeil] - robinsonAA[latitudeStepFloor]) * latitudeInterpolation;
    var BB = robinsonBB[latitudeStepFloor] + (robinsonBB[latitudeStepCeil] - robinsonBB[latitudeStepFloor]) * latitudeInterpolation;

    var robinsonWidth = 2 * Math.PI * robinsonAA[0];
    var widthFactor = mapWidth / robinsonWidth;
    var latitudeSign = Math.sign(latitude) || 1;
    var x = (widthFactor * AA * longitude * Math.PI) / 180 + mapOffsetX;
    var y = widthFactor * BB * latitudeSign * heightFactor + mapOffsetY;

    return {x: x, y: y};
}

function projectAbsolute(latitude, longitude, mapWidth, heightFactor, mapOffsetX, mapOffsetY) {
    if (typeof heightFactor === 'undefined') { heightFactor = 1; }

    var relative = project(latitude, longitude, mapWidth, heightFactor, mapOffsetX, mapOffsetY);
    var widthHeightRatio = Math.PI * robinsonAA[0] / robinsonBB[18];
    var x = mapWidth / 2 + relative.x;
    var y = mapWidth / widthHeightRatio * heightFactor / 2 - relative.y;

    return {x: x, y: y};
}
