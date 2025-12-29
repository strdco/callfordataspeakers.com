







/* Housekeeping stuff to do when the page finishes loading */
window.onload = function yeahyeah() {

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

