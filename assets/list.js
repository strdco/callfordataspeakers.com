var timeoutHandler;
var rangeFrom;
var rangeTo;
var searchString;
var includeClosed=true;
var listOfEvents=[];








/* Housekeeping stuff to do when the page finishes loading */
window.onload = function yeahyeah() {


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
                } else if (row.EventName.toLowerCase().split(' ').join('').includes('dayofdata')) {
                    a.classList.add('sqlsaturday');
                } else if (row.EventName.toLowerCase().split(' ').join('').includes('datasat')) {
                    a.classList.add('datasaturday');
                } else {
                    a.classList.add('uncategorized');
                }

                td2.appendChild(a);
                tr.appendChild(td2);

                var td3=document.createElement('td');

                const regions=row.Regions.split(',');
                var badge=document.createElement('span');
                badge.classList.add('badge');
                badge.classList.add('event-type');
                if (regions.includes("Virtual") && regions.length>1) {
                    badge.innerText="Hybrid";
                    badge.classList.add('hybrid');
                } else if (regions.includes("Virtual")) {
                    badge.innerText="Virtual";
                    badge.classList.add('virtual');
                } else {
                    badge.innerText="In-person";
                    badge.classList.add('in-person');
                }
                td3.appendChild(badge);

                var td3_span=document.createElement('span');
                var venue=row.Venue;
                if (!["online", "virtual"].includes(venue.trim().toLowerCase())) {
                    td3_span.innerText=row.Venue;
                    td3.appendChild(td3_span);                    
                }
                tr.appendChild(td3);

                tbody.appendChild(tr);

                // Add a point to the map:
                if (row.Lat && row.Long) {
                    plotMapPoint(mapContainer, row.Lat, row.Long, mapPointCss, row.EventName);
                }

            });

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
