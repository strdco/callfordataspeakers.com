var searchInput;
var searchTimeout;
var preconSpeakers;








/* Housekeeping stuff to do when the page finishes loading */
window.onload = function yeahyeah() {





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

            for (tr of tbody.getElementsByTagName('tr')) {
                matched=(searchInput.value=='' ? true : false);

                if(tr.children[0].tagName.toLowerCase()=='td') {
                    if (searchCriteria.find(c => tr.innerText.toLowerCase().replace(/ /g, '').indexOf(c.trim())>=0)) { matched=true; }
                    tr.style.display=(matched ? 'table-row' : 'none');
                };
            }
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


}
