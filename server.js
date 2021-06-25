#!/usr/bin/env node

const validUrl=/^(http|https):\/\/.{1,}\..{1,}/gi;




// Core modules:
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const url = require('url');

// Other modules:
const express = require('express');
const bodyParser = require('body-parser');

// Mailchimp Marketing API
const mailchimp = require("@mailchimp/mailchimp_marketing");

mailchimp.setConfig({
    apiKey: process.env.mcapikey,
    server: process.env.mcapikey.split("-")[1],
});

// The Express web server itself:
const app = express();
app.use(bodyParser.urlencoded({
        extended: true
    }));
app.use(bodyParser.json({limit: '50mb'}))
app.disable('etag');
app.disable('x-powered-by');
app.enable('trust proxy');

// Error handler for Express and its middlewares, like BodyParser, etc.
// Source: https://stackoverflow.com/a/53048858/5471286
app.use((err, req, res, callback) => {
    console.error(err);
    res.sendStatus(500);
    callback();
});
  
// Tedious: used to connect to SQL Server:
const Connection = require('tedious').Connection;
const Request = require('tedious').Request;
const Types = require('tedious').TYPES;

// Connection string to the SQL Database:
var connectionString = {
    server: process.env.dbserver,
    authentication: {
        type: 'default',
        options: {
            userName: process.env.dblogin,
            password: process.env.dbpassword
        }
    },
    options: { encrypt       : true,
               database      : process.env.dbname,
               connectTimeout : 20000,   // 20 seconds before connection attempt times out.
               requestTimeout : 30000,   // 20 seconds before request times out.
               rowCollectionOnRequestCompletion : true,
               dateFormat    : 'ymd',
               keepAlive     : true, /*
               isolationLevel: 'SERIALIZABLE',
               connectionIsolationLevel : 'SERIALIZABLE', */
               appName       : 'callfordataspeakers.com', // host name of the web server
               validateBulkLoadParameters: true // whatever it takes to stop the nagging.
        } 
    };






/*-----------------------------------------------------------------------------
  Start the web server
-----------------------------------------------------------------------------*/
var serverPort=process.argv[2] || process.env.PORT || 3000;

console.log('    **** CALLFORDATASPEAKERS.COM ****');
console.log('HTTP port:       '+serverPort);
console.log('Database server: '+process.env.dbserver);
console.log('Express env:     '+app.settings.env);
console.log('');
app.listen(serverPort, () => console.log('READY.'));








/*-----------------------------------------------------------------------------
  Start page: Speaker registration
-----------------------------------------------------------------------------*/

app.get('/', function (req, res, next) {

    httpHeaders(res);

    // Serve up assets/speaker.html:
    res.status(200).send(createHTML('speaker.html', {}));
});






/*-----------------------------------------------------------------------------
  Event request
-----------------------------------------------------------------------------*/

app.get('/event', function (req, res, next) {

    httpHeaders(res);

    // Serve up assets/event.html:
    res.status(200).send(createHTML('event.html', {}));
});







/*-----------------------------------------------------------------------------
  Register a new event request, send a request email to moderator:
-----------------------------------------------------------------------------*/

app.all('/request', function (req, res, next) {

    httpHeaders(res);

    // Parse query string parameters:
    queryParams = querystring.parse(url.parse(req.url).query);

    // The "c" variable is passed from the Mailchimp validation form, and I
    // suppose it fills some kind of purpose that we pass it back in our response:
    jQueryIdentifier=queryParams.c;

    // Honey trap triggered: this is a bot
    if (queryParams.free_hunny) {
        res.status(404);
        return;
    }

    // Could be GET or POST, so we'll check both:
    var formName=(queryParams.FNAME || req.body.FNAME)+' '+(queryParams.LNAME || req.body.LNAME);
    var formEmail=req.body.EMAIL || queryParams.EMAIL;
    var formEventName=req.body.EVENT || queryParams.EVENT;
    var formEventVenue=req.body.VENUE || queryParams.VENUE;
    var formEventDate;
    try {
        formEventDate=new Date(
            (queryParams["EVENTDATE[year]"] || req.body["EVENTDATE[year]"])+'-'+
            (queryParams["EVENTDATE[month]"] || req.body["EVENTDATE[month]"])+'-'+
            (queryParams["EVENTDATE[day]"] || req.body["EVENTDATE[day]"])+' 00:00:00+00:00').toISOString().split("T")[0];
    } catch(err) {
        res.status(400);
        return;
    }
    var formEventURL=queryParams.URL || req.body.URL;
    var formEventInfo=queryParams.INFO || req.body.INFO;

    // If you select a single region, it's a string, but with multiple regions, the
    // variable turns into an array. So if it's an array, we need to turn it back
    // into a comma-delimited string again.

    var formEventRegions=(queryParams.REGION || req.body.REGION);
    if (typeof formEventRegions!='string') {
        formEventRegions=formEventRegions.join(",");
    }

    // Same type of logic for event type as for event region above.

    var formEventType=(queryParams.TYPE || req.body.TYPE || "");
    if (typeof formEventType!='string') {
        formEventType=formEventType.join(", ");
    }

    // Very basic form validation:
    if(!formName  || !formEmail || !formEventName ||
       !formEventVenue || !formEventDate  ||
       formEventRegions.split(",").length>3 ||
       !formEventURL.match(validUrl)) {
            console.log("Pretty clever, huh.");
            res.status(400).send('Not like this.');
            return;

    } else {

        // Save the everything to the SQL Server table:
        sqlQuery(connectionString,
            'EXECUTE CallForDataSpeakers.Insert_Campaign @Name=@Name, @Email=@Email, @EventName=@EventName, @EventType=@EventType, @Regions=@Regions, @Venue=@Venue, @Date=@Date, @URL=@URL, @Information=@Information;',
            [   { "name": 'Name',    "type": Types.NVarChar, "value": formName },
                { "name": 'Email',   "type": Types.NVarChar, "value": formEmail },
                { "name": 'EventName', "type": Types.NVarChar, "value": formEventName },
                { "name": 'EventType', "type": Types.NVarChar, "value": formEventType },
                { "name": 'Regions', "type": Types.NVarChar, "value": formEventRegions },
                { "name": 'Venue',   "type": Types.NVarChar, "value": formEventVenue },
                { "name": 'Date',    "type": Types.Date,     "value": formEventDate },
                { "name": 'URL',     "type": Types.NVarChar, "value": formEventURL },
                { "name": 'Information', "type": Types.NVarChar, "value": formEventInfo }],

                // The stored procedure will return a uniqueidentifier (Token), used to identify
                // each event request:
                function(recordset) {
                    if (recordset) {

                        // Create an email to all moderators, requesting event approval:
                        var approveButton='<a class="mcnButton" title="Approve" href="https://callfordataspeakers.com/approve/'+recordset[0].Token+'" '+
                                                'target="_blank" style="font-weight:normal;letter-spacing:normal;line-height:100%;text-align:center;'+
                                                'text-decoration:none;color:#000000;">Approve</a>';


                        // These are the "mc:edit" values that we want to fill into our template:
                        var templateSections={
                            "name": formName,
                            "event_email": formEmail,
                            "event_regions": formEventRegions,
                            "event_name": formEventName,
                            "event_type": formEventType,
                            "event_venue": formEventVenue,
                            "event_date": formEventDate,
                            "event_url": formEventURL,
                            "event_info": formEventInfo,
                            "event_approve": approveButton
                        };

                        // Here's where we send the campaign:
                        sendCampaign(process.env.organizer_audience,                                    // Audience
                                    'Moderators',                                                       // Segment name
                                    '',
                                    process.env.request_template,                                       // Template name
                                    false,                                                              // Tracking
                                    false,                                                              // Tweet
                                    templateSections,                                                   // Values template fields
                                    'New campaign request',                                             // Subject line
                                    'There\'s a new request for a call for speakers email to review.',  // Preview
                                    'hello@callfordataspeakers.com')                                    // Reply-to

                            // Send successful:
                            .then(() => {
                                res.status(200).send(
                                    jQueryIdentifier+'('+
                                    JSON.stringify({
                                        "result": "success",
                                        "msg": "Thank you. A moderator will review your request."
                                    })+')'
                                );
                                return;
                            })
    
                            // Send failed:
                            .catch(err => {
                                console.log(err);

                                res.status(500).send(
                                    jQueryIdentifier+'('+
                                    JSON.stringify({
                                        "result": "error",
                                        "msg": "Sorry. Something didn\'t work out."
                                    })+')'
                                );
                                return;
                            });

                    } else {
                        console.log('ERROR: Couldn\'t create the campain record in the database.');
                        res.status(500).send('There was a problem with the database connection.');
                        return;
                    }
        });
    }
});







/*-----------------------------------------------------------------------------
  Approve an event request, send campaign to speakers:
-----------------------------------------------------------------------------*/

app.get('/approve/:token', function (req, res, next) {
    res.status(200).send(createHTML('message.html', {
        "subject": "Approving...",
        "message": "Hang on..",
        "script": '<script src="/assets/approve.js"></script>'
    }));
});

app.get('/approve/:token/do', function (req, res, next) {

    httpHeaders(res);

    // The part of the URL that reflects the token:
    var token=req.params.token;

    // Approve the campaign in the database and retrieve the event information:
    sqlQuery(connectionString,
        'EXECUTE CallForDataSpeakers.Approve_Campaign @Token=@Token;',
        [   { "name": 'Token', "type": Types.NVarChar, "value": token }],

            async function(recordset) {
                if (recordset) {

                    // formatting the event date; example: Tuesday, December 22, 2020"
                    var eventDateString=recordset[0].Date.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    
                    var eventInfoString=recordset[0].Information;
                    if (eventInfoString===null) { eventInfoString=''; }

                    // If the only region is "Virtual", this is a virtual event.
                    // If there are other regions, but they include "Virtual", this is a hybrid event.
                    // If there's no "Virtual" region, this is an in-person event.
                    var eventVirtualString;
                    if (recordset[0].Regions.toUpperCase().replace(' ', '').split(',')=='VIRTUAL') {
                        eventVirtualString='This is a virtual event';
                    }
                    else if (recordset[0].Regions.toUpperCase().replace(' ', '').split(',').includes('VIRTUAL')) {
                        eventVirtualString='This is an in-person event, but may also accept virtual session abtracts.';
                    }
                    else {
                        eventVirtualString='This is an in-person event.';
                    }

                    // This is the button at the bottom of the email:
                    var eventButton='<a class="mcnButton" title="Approve" href="'+recordset[0].URL+'" '+
                                        'target="_blank" style="font-weight:normal;letter-spacing:normal;line-height:100%;text-align:center;'+
                                        'text-decoration:none;color:#000000;">View the Call for Speakers</a>';

                    // These are the "mc:edit" values that we want to fill into our template:
                    var templateSections={
                        "event_name": recordset[0].EventName,
                        "event_date": eventDateString,
                        "event_virtual": eventVirtualString,
                        "event_venue": recordset[0].Venue,
                        "event_type": recordset[0].EventType,
                        "name": recordset[0].Name,
                        "event_email": recordset[0].Email,
                        "event_info": eventInfoString,
                        "event_button": eventButton
                    };

                    // Send the Mailchimp campaign to all our subscribers:
                    sendCampaign(process.env.speaker_audience,  // Audience
                                '',
                                recordset[0].Regions,           // Region group members
                                process.env.campaign_template,  // Template name
                                true,                           // Tracking
                                true,                           // Tweet
                                templateSections,               // Values to template fields
                                'Call for speakers: '+recordset[0].EventName,   // Subject line
                                recordset[0].EventName+' is coming to you on '+eventDateString+'. The call for speakers is open!',      // Preview
                                'hello@callfordataspeakers.com')        // Reply-to
                                 
                        // Success:
                        .then(() => {
                            res.status(200).send(createHTML('message.html', {
                                "subject": "Campaign sent",
                                "message": "Your campaign has been scheduled and will be sent out."
                            }));
                            return;
                        })

                        // Or not:
                        .catch(err => {
                            res.status(500).json(err);
                            return;
                        });

                } else {
                    console.log('Invalid token: '+token+'.');
                    res.status(404).send(createHTML('message.html', {
                        "subject": "Nope",
                        "message": "That token is invalid or already used."
                    }));
                    return;
                }
    });

});









/*-----------------------------------------------------------------------------
  REST API-ish to list events:
-----------------------------------------------------------------------------*/

app.get('/api/events', function (req, res, next) {

    httpHeaders(res);

    // Approve the campaign in the database and retrieve the event information:
    sqlQuery(connectionString,
        'SELECT EventName, EventType, Regions, Email, Venue, [Date], [URL], Information, Created FROM CallForDataSpeakers.Feed ORDER BY [Date], Created;', [],

            async function(recordset) {

                res.status(200).json(recordset);
                return;
            });

});

/*-----------------------------------------------------------------------------
  List events:
-----------------------------------------------------------------------------*/

app.get('/list', function (req, res, next) {

    httpHeaders(res);

    res.status(200).send(createHTML('list.html', {}));
    return;

});









/*-----------------------------------------------------------------------------
  RSS feed:
-----------------------------------------------------------------------------*/

app.get('/feed', async function (req, res, next) {

    var items='';
    sqlQuery(connectionString,
        'SELECT EventName, EventType, Regions, Email, Venue, [Date], [URL], Information, Created, DATEDIFF_BIG(second, {d \'1970-01-01\'}, Created) AS uid FROM CallForDataSpeakers.Feed ORDER BY Created DESC;', [],

            async function(recordset) {

                var lastBuildDate=new Date(Date.now())

                recordset.forEach(item => {

                    var eventDate=item.Date.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });            

                    items+='<item>\n'+
                            '<title>'+item.EventName+'</title>\n'+
                            '<link>'+item.URL+'</link>\n'+
                            '<dc:creator>Call for Data Speakers</dc:creator>\n'+
                            '<pubDate>' + item.Created.toUTCString() + '</pubDate>\n'+
                            '<category>Call for Speakers</category>\n'+
                            '<guid isPermaLink="false">'+item.uid+'</guid>\n'+
                            '<description><![CDATA['+item.EventName+']]></description>\n'+
                            '<content:encoded><![CDATA['+
                                item.EventName+' is coming to you on '+eventDate+'<br/>\n'+
                                'The <a href="'+item.URL+'">call for speakers</a> is open.\n'+
                                ']]></content:encoded>\n'+
                            '<media:content url="https://callfordataspeakers.com/assets/callfordataspeakers-logo.png" medium="image">\n'+
                                '<media:title type="html">dhmacher</media:title>\n'+
                            '</media:content>\n'+
                        '</item>\n\n'
                });

                res.type('application/rss+xml; charset=UTF-8');
                res.status(200).send(createHTML('rss.xml', {
                        "lastBuildDate": lastBuildDate.toUTCString(),
                        "items": items
                    }));
                return;
            
            });
});







/*-----------------------------------------------------------------------------
  List events:
-----------------------------------------------------------------------------*/

app.get('/api/sync-mailchimp', async function (req, res, next) {

    try {
        var subscriberCount = await getSubscriberCount(process.env.speaker_audience);
        res.status(200).json(subscriberCount);
    } catch(err) {
        res.status(500);
    }
    console.log('Done');

});

async function getSubscriberCount(listName) {
    var listId;
    var groupId;
    var subscriberCount;
    var regions=[];

    // Find the "Speakers" list (the audience):
    var allLists = await mailchimp.lists.getAllLists();
    Array.prototype.forEach.call(allLists.lists, list => {
        if (list.name==listName) {
            listId=list.id;
            subscriberCount=list.stats.member_count;
        }
    });

    // Find the "Regions" group:
    var allGroups = await mailchimp.lists.getListInterestCategories(listId);
    Array.prototype.forEach.call(allGroups.categories, group => {
        if (group.title=='Region') {
            groupId=group.id;
        }
    });

    // Fetch all regions:
    var allGroupMembers=await mailchimp.lists.listInterestCategoryInterests(listId, groupId, {"count": 100});
    Array.prototype.forEach.call(allGroupMembers.interests, member => {
        regions.push({
            "name": member.name,
            "subscriber_count": member.subscriber_count
        });
    });

    // Write to file
    fs.writeFileSync(__dirname + '/assets/subscriber-count.json', JSON.stringify(regions));

    // Return the results:
    return(regions);

}






/*-----------------------------------------------------------------------------
  Other related assets, like client-side JS, CSS, images, whatever:
-----------------------------------------------------------------------------*/

app.get('/assets/:asset', function (req, res, next) {

    httpHeaders(res);

    var options = {
        root: __dirname + '/assets/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    res.sendFile(req.params.asset, options, function(err) {
        if (err) {
            res.send(err);
            return;
        }
    });
});

app.get('/:asset', function (req, res, next) {

    httpHeaders(res);

    var options = {
        root: __dirname + '/assets/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    res.sendFile(req.params.asset, options, function(err) {
        if (err) {
            res.send(err);
            return;
        }
    });
});







/*-----------------------------------------------------------------------------
  Format the HTML template:
-----------------------------------------------------------------------------*/
function createHTML(templateFile, values) {
    var rn=Math.random();

    // Read the template file:
    var htmlTemplate = fs.readFileSync(path.resolve(__dirname, './assets/'+templateFile), 'utf8').toString();

    // Loop through the JSON blob given as the argument to this function,
    // replace all occurrences of <%=param%> in the template with their
    // respective values.
    for (var param in values) {
        if (values.hasOwnProperty(param)) {
            htmlTemplate = htmlTemplate.split('\<\%\='+param+'\%\>').join(values[param]);
        }
    }

    // Special parameter that contains a random number (for caching reasons):
    htmlTemplate = htmlTemplate.split('\<\%\=rand\%\>').join(rn);
    
    // Clean up any remaining parameters in the template
    // that we haven't replaced with values from the JSON argument:
    while (htmlTemplate.includes('<%=')) {
        param=htmlTemplate.substr(htmlTemplate.indexOf('<%='), 100);
        param=param.substr(0, param.indexOf('%>')+2);
        htmlTemplate = htmlTemplate.split(param).join('');
    }

    // DONE.
    return(htmlTemplate);
}









/*-----------------------------------------------------------------------------
  Canned Mailchimp template campaign:
-----------------------------------------------------------------------------*/

async function sendCampaign (listName, segmentName, regions, templateName, enableTracking, tweet, templateSections, subjectLine, previewText, replyTo) {

    var listId;
    var segmentId;
    var templateId;
    var campaignId;
    var segmentOpts;

    const showDebugInfo=true;

    // Defaults:
    if (!subjectLine) { subjectName=templateName; }
    if (!replyTo) { replyTo='hello@callfordataspeakers.com'; }

    try {

        // Find the "Organizers" or "Speakers" list (the audience):
        // ----------------------------------------------
        var allLists = await mailchimp.lists.getAllLists();
        Array.prototype.forEach.call(allLists.lists, list => {
            if (list.name==listName) {
                listId=list.id;
            }
        });

        if (showDebugInfo) { console.log('list_id='+listId); }

        // Find the segment, or create an ad-hoc segment:
        // ----------------------------------------------
        if (listId) {

            // Option 1: Find a specific, named segment:
            if (segmentName) {
                var allSegments = await mailchimp.lists.listSegments(listId);
                Array.prototype.forEach.call(allSegments.segments, segment => {
                    if (segment.name==segmentName) {
                        segmentId=segment.id;

                        segmentOpts={
                            "saved_segment_id": segmentId
                        };
                    }
                });

                if (showDebugInfo) { console.log('segment_id='+segmentOpts.saved_segment_id); }

            }

            // Option 2: Create an ad-hoc segment from a list of one or more regions:
            if (regions) {

                // Normalize region names to simplify matching:
                regions=regions.toUpperCase().replace('-', '').replace(' ', '');

                // 2a. Find the Group ID for the "Region" group:
                var groupId;
                var allGroups = await mailchimp.lists.getListInterestCategories(listId);

                Array.prototype.forEach.call(allGroups.categories, group => {
                    if (group.title=='Region') {
                        groupId=group.id;
                    }
                });

                var memberList=[];

                // 2b. Find all matching regions:
                var allGroupMembers=await mailchimp.lists.listInterestCategoryInterests(listId, groupId, {"count": 100});

                Array.prototype.forEach.call(allGroupMembers.interests, member => {
                    console.log(member.name+'?');
                    // Is this member in the list of regions?
                    if (regions.split(",").includes(member.name.toUpperCase().replace('-', '').replace(' ', ''))) {
                        console.log('Yup.');
                        memberList.push(member.id);
                    } else {
                        console.log('Nope.');
                    }
                });

                segmentOpts={
                    "match": "any",
                    "conditions": [{
                        "condition_type": "Interests",
                        "field": "interests-"+groupId,
                        "op": "interestcontains",
                        "value": memberList
                    }]
                };

                if (showDebugInfo) { console.log('conditions='); console.log(segmentOpts.conditions); }

            }
        }

        // Find the template:
        // ----------------------------------------------
        if (segmentOpts) {
            var allTemplates = await mailchimp.templates.list();

            Array.prototype.forEach.call(allTemplates.templates, template => {
                if (template.name==templateName) {
                    templateId=template.id;
                }
            });

            if (showDebugInfo) { console.log('template_id='+templateId); }
        }

        // Create the campaign:
        // ----------------------------------------------
        if (templateId) {
            var campaignParameters = {
                "type": "regular",
                "recipients": {
                    "list_id": listId,
                    "segment_opts": segmentOpts
                },
                "settings": {
                    "subject_line": subjectLine,
                    "preview_text": previewText,
                    "title": subjectLine,
                    "from_name": "Call for Data Speakers",
                    "reply_to": replyTo,
                    "authenticate": true,
                    "auto_footer": false,
                    "auto_tweet": tweet,
                    "template_id": templateId
                },
                "tracking": {
                    "opens": enableTracking,
                    "html_clicks": enableTracking,
                    "text_clicks": enableTracking,
                    "goal_tracking": enableTracking,
                    "ecomm360": false
                },
                "content_type": "template",
                "social_card": {
                    "image_url": "https://callfordataspeakers.com/assets/social-preview.jpeg",
                    "description": previewText,
                    "title": subjectLine
                }
            };
            var campaign = await mailchimp.campaigns.create(campaignParameters);
            campaignId = campaign.id;

            if (showDebugInfo) { console.log('campaign_id='+campaignId); }
        }

        // Update the campaign with the template values:
        // ----------------------------------------------
        if (campaignId) {

            if (templateSections) {
                var updateInstructions={
                    "template": {
                        "id": templateId,
                        "sections": templateSections
                    }
                };
                await mailchimp.campaigns.setContent(campaignId, updateInstructions);
                console.log('Campaign updated.');
            }

            // Update the campaign with the template values:
            // ----------------------------------------------
            await mailchimp.campaigns.send(campaignId);
            console.log('Campaign sent.');
        }
    } catch (err) {
        console.log(err);
        res.status(500).send("There was a problem");
    }
}













/*-----------------------------------------------------------------------------
  Canned SQL interface:
-----------------------------------------------------------------------------*/
function sqlQuery(connectionString, statement, parameters, next) {
    // Connect:
    var conn = new Connection(connectionString);
    var rows=[];
    var columns=[];
    var errMsg;

    conn.on('infoMessage', connectionError);
    conn.on('errorMessage', connectionError);
    conn.on('error', connectionGeneralError);
    conn.on('end', connectionEnd);

    conn.connect(err => {
        if (err) {
            console.log(err);
            next();
        } else {
            exec();
        }
    });

    function exec() {
        var request = new Request(statement, statementComplete);

        parameters.forEach(function(parameter) {
            request.addParameter(parameter.name, parameter.type, parameter.value);
        });

        request.on('columnMetadata', columnMetadata);
        request.on('row', row);
        request.on('done', requestDone);
        request.on('requestCompleted', requestCompleted);
      
        conn.execSql(request);
    }

    function columnMetadata(columnsMetadata) {
        columnsMetadata.forEach(function(column) {
            columns.push(column);
        });
    }

    function row(rowColumns) {
        var values = {};
        rowColumns.forEach(function(column) {
            values[column.metadata.colName] = column.value;
        });
        rows.push(values);
    }

    function statementComplete(err, rowCount) {
        if (err) {
            console.log('Statement failed: ' + err);
            errMsg=err;
            next();
        } else {
            console.log('Statement succeeded: ' + rowCount + ' rows');
        }
    }

    function requestDone(rowCount, more) {
        console.log('Request done: ' + rowCount + ' rows');
    }

    function requestCompleted() {
        console.log('Request completed');
        conn.close();
        if (!errMsg) {
            next(rows);
        }
    }
      
    function connectionEnd() {
        console.log('Connection closed');
    }

    function connectionError(info) {
        console.log('Msg '+info.number + ': ' + info.message);
    }

    function connectionGeneralError(err) {
        console.log('General database error:');
        console.log(err);
    }

}






function httpHeaders(res) {
    // The "preload" directive also enables the site to be pinned (HSTS with Preload)
    const hstsPreloadHeader = 'max-age=31536000; includeSubDomains; preload'
    res.header('Strict-Transport-Security', hstsPreloadHeader); // HTTP Strict Transport Security with preload

    // Limits use of external script/css/image resources
    // Mailchimp made me add the 'unsafe-eval' and 'unsafe-inline' stuff. :(
    res.header('Content-Security-Policy', "default-src https: 'self'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-eval' 'self' 'unsafe-inline' https://*.list-manage.com https://s3.amazonaws.com/downloads.mailchimp.com/;");

    // Don't allow this site to be embedded in a frame; helps mitigate clickjacking attacks
    res.header('X-Frame-Options', 'sameorigin');

    // Prevent MIME sniffing; instruct client to use the declared content type
    res.header('X-Content-Type-Options', 'nosniff');

    // Don't send a referrer to a linked page, to avoid transmitting sensitive information
    res.header('Referrer-Policy', 'no-referrer');

    // Limit access to local devices
    res.header('Permissions-Policy', "camera=(), display-capture=(), microphone=(), geolocation=(), usb=()"); // replaces Feature-Policy
  //res.header('Feature-Policy', "camera 'none'; microphone 'none'; usb 'none'");

    return;
}
