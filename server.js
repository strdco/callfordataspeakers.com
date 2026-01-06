#!/usr/bin/env node

const validUrl=/^(http|https):\/\/.{1,}\..{1,}/gi;




// Core modules:
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const url = require('url');
const https = require('https');
const crypto = require('crypto');

// Other modules:
const express = require('express');
const bodyParser = require('body-parser');

// Canned SQL
const cannedSql=require('./canned-sql.js');

// Headers sent in API calls to Sender.net
const senderApiHeaders = {
    "Authorization": "Bearer "+process.env.sender_token,
    "Content-Type":  "application/json",
    "Accept":        "application/json"
}

const senderEmail = process.env.sender_email;

// ATProtocol (for Bluesky)
const blue = require('@atproto/api');

// The Express web server itself:
const app = express();
app.use(bodyParser.urlencoded({
        extended: true
    }));
app.use(bodyParser.json({limit: '50mb'}))
app.disable('etag');
app.disable('x-powered-by');
app.enable('trust proxy');


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

// Are we running in a test environment? This prevents posting to social media,
// accidentally emailing production users, etc.
var isTestEnvironment=false;
if (process.env.dbname.toLowerCase().indexOf("test")>=0 ||
    process.env.dblogin.toLowerCase().indexOf("test")>=0) {

    isTestEnvironment=true;
}





/*-----------------------------------------------------------------------------
  Start the web server
  -----------------------------------------------------------------------------*/
var serverPort=process.argv[2] || process.env.PORT || 3000;

console.log('    **** CALLFORDATASPEAKERS.COM ****');
console.log('HTTP port:       '+serverPort);
console.log('Database server: '+process.env.dbserver);
console.log('Database name:   '+process.env.dbname);
console.log('Express env:     '+app.settings.env);
console.log('');

// HTML endpoints
app.get('/', speakerPage);
app.all('/event', eventPage);
app.get('/list', listPage);
app.get('/precon', preconPage);
app.get('/modify', modifySubscriptionPage);
app.get('/moderate/:token', moderationPage);

// Other
app.get('/feed', getRssFeed);
app.get('/robots933456.txt', healthCheck);

// API endpoints
app.post('/api/request', doEventRequest);
app.post('/api/subscribe', doSubscribe);
app.post('/api/update/:token', doModifyRequest);
app.post('/api/approve/:token', doApproveRequest);
app.get('/digest/:apikey', sendDigestCampaign);
app.get('/api/events', listEvents);
app.get('/api/event/:token', getEvent);
app.get('/api/sync-subscriber-count/:apikey', syncSubscriberCount);
app.get('/api/get-sessionize', getSessionizeDetails);
app.get('/api/sync-sessionize/:apikey', doSyncSessionize);

// Other assets (stylesheets, images, etc)
app.get('/assets/:asset', getAsset);
app.get('/:asset', getAsset);

// Error handler. Needs to go last.
app.use((err, req, res, callback) => {
    console.error(err);
    res.sendStatus(500);
    callback();
});

// Start your engines
app.listen(serverPort, () => console.log('READY.'));




/*-----------------------------------------------------------------------------
  Azure Linux App Service Plan health check request:
  ---------------------------------------------------------------------------*/

function healthCheck(req, res, next) {
    console.log("Azure health check: OK.");
    res.status(200).send("OK");
}




/*-----------------------------------------------------------------------------
  Start page: Speaker registration
  -----------------------------------------------------------------------------*/

function speakerPage(req, res, next) {

    httpHeaders(res);

    // Serve up assets/speaker.html:
    res.status(200).send(createHTML('speaker.html', {}));
}





/*-----------------------------------------------------------------------------
  Modify speaker registration
  -----------------------------------------------------------------------------*/

async function modifySubscriptionPage(req, res, next) {

    const queryParams = querystring.parse(url.parse(req.url).query);

    const subscriber = await fetch("https://api.sender.net/v2/subscribers/" + encodeURIComponent(queryParams.email), {
        method: "GET",
        headers: senderApiHeaders
    }).then(response => response.json());

    httpHeaders(res);

    if(!subscriber.data.columns.find(col => col.title==="sha256")) {
        res.status(401).send("Subscriber does not have a hash key.");
        return;
    }

    // Check that the key in the URL matches the hash on the subscriber record.
    if(subscriber.data.columns.find(col => col.title==="sha256").value !== queryParams.key) {
        res.status(401).send("Subscriber key does not match.");
        return;
    };

    // Serve up assets/speaker.html:
    res.status(200).send(createHTML('speaker.html', {
        "email": subscriber.data.email,
        "first-name": subscriber.data.firstname,
        "last-name": subscriber.data.lastname,
        "key": queryParams.key,
        "email-locked": " READONLY",
        "groups": subscriber.data.subscriber_tags.map(tag => { return tag.title })
    }));
}





/*-----------------------------------------------------------------------------
  Event request
  -----------------------------------------------------------------------------*/

function eventPage(req, res, next) {

    var map={};

    if (req.body) {
        if (req.body.url) { map.url=encodeHtml(req.body.url); }
        if (req.body.email) { map.url=encodeHtml(req.body.email); }
        if (req.body.fname) { map.url=encodeHtml(req.body.fname); }
        if (req.body.lname) { map.url=encodeHtml(req.body.lname); }
        if (req.body.eventname) { map.url=encodeHtml(req.body.eventname); }
        if (req.body.venue) { map.url=encodeHtml(req.body.venue); }
        if (req.body.date) {
            var dt=new Date(req.body.date);

            if (!isNaN(dt)) {
                map.year=dt.getUTCFullYear();
                map.month=dt.getUTCMonth()+1;
                map.day=dt.getUTCDate();
            }
        }
        if (req.body.year) { map.year=encodeHtml(req.body.year); }
        if (req.body.month) { map.month=encodeHtml(req.body.month); }
        if (req.body.day) { map.day=encodeHtml(req.body.day); }

        if (req.body.virtual) { map.virtual_check='checked'; }

        if (req.body.conference) { map.conference_check='checked'; }
        if (req.body.precon) { map.precon_check='checked'; }
        if (req.body.usergroup) { map.usergroup_check='checked'; }
        if (req.body.paid) { map.paid_check='checked'; }
    }

    httpHeaders(res);

    // Serve up assets/event.html:
    res.status(200).send(createHTML('event.html', map));
}







/*-----------------------------------------------------------------------------
  Event request moderation
  -----------------------------------------------------------------------------*/

function moderationPage(req, res, next) {

    httpHeaders(res);

    // Serve up assets/moderate.html:
    res.status(200).send(createHTML('moderate.html', {}));
}







/*-----------------------------------------------------------------------------
  Register a new event request, send a request email to moderator:
  -----------------------------------------------------------------------------*/

function doEventRequest(req, res, next) {

    httpHeaders(res);

    var formName=req.body["first-name"]+" "+req.body["last-name"];
    var formEmail=req.body.email;
    var formEventName=req.body.event;
    var formEventVenue=req.body.venue;

    var formEventDate;
    try {
        formEventDate=new Date(req.body["event-date"]).toISOString().split("T")[0];
    } catch(err) {
        res.status(400).send("Input validation failed on EVENTDATE parameters.");
        return;
    }

    var formEventEndDate;
    try {
        if (req.body["event-end-date"]) {
            formEventEndDate=new Date(req.body["event-end-date"]).toISOString().split("T")[0];
        }
    } catch(err) {
        res.status(400).send("Input validation failed on EVENTENDDATE parameters.");
        return;
    }

    var formEventURL=req.body.url;
    var formEventInfo=req.body.info;

    // If you select a single region, it's a string, but with multiple regions, the
    // variable turns into an array. So if it's an array, we need to turn it back
    // into a comma-delimited string again.

    var formEventRegions=req.body.groups;
    if (typeof formEventRegions!='string') {
        formEventRegions=formEventRegions.join(",");
    }

    // Same type of logic for event type as for event region above.

    var formEventType=req.body.types;
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
        cannedSql.sqlQuery(connectionString,
            'EXECUTE CallForDataSpeakers.Insert_Campaign @Name=@Name, @Email=@Email, @EventName=@EventName, @EventType=@EventType, @Regions=@Regions, @Venue=@Venue, @Date=@Date, @EndDate=@EndDate, @URL=@URL, @Information=@Information;',
            [   { "name": 'Name',    "type": Types.NVarChar, "value": formName },
                { "name": 'Email',   "type": Types.NVarChar, "value": formEmail },
                { "name": 'EventName', "type": Types.NVarChar, "value": formEventName },
                { "name": 'EventType', "type": Types.NVarChar, "value": formEventType },
                { "name": 'Regions', "type": Types.NVarChar, "value": formEventRegions },
                { "name": 'Venue',   "type": Types.NVarChar, "value": formEventVenue },
                { "name": 'Date',    "type": Types.Date,     "value": formEventDate },
                { "name": 'EndDate', "type": Types.Date,     "value": formEventEndDate },
                { "name": 'URL',     "type": Types.NVarChar, "value": formEventURL },
                { "name": 'Information', "type": Types.NVarChar, "value": formEventInfo }],

                // The stored procedure will return a uniqueidentifier (Token), used to identify
                // each event request:
                function(recordset) {
                    if (recordset.data) {

                        // These are the values that we want to fill into our template:
                        var templateSections={
                            "submitted-by-name": encodeHtml(formName),
                            "submitted-by-email": encodeHtml(formEmail),
                            "region": encodeHtml(formEventRegions.split(",").join(", ")),
                            "event-name": encodeHtml(formEventName),
                            "event-type": encodeHtml(formEventType),
                            "venue": encodeHtml(formEventVenue),
                            "event-date": formEventDate + (formEventEndDate ? ' -> ' + formEventEndDate : ''),
                            "event-url": formEventURL,
                            "event-information": encodeHtml(formEventInfo),
                            "review-url": "https://"+req.hostname+"/moderate/"+recordset.data[0].Token
                        };

                        // Here's where we send the campaign:
                        if (sendCampaign(
                                    'Moderators',                                                       // "Regions"
                                    "email-campaign-request.html",                                      // Template name
                                    templateSections,                                                   // Values template fields
                                    'New campaign request',                                             // Subject line
                                    'There\'s a new request for a call for speakers email to review.')) // Preview
                        {
                            // Success
                            res.status(200).send({
                                    "result": "success",
                                    "msg": "Thank you. A moderator will review your request."
                                });
                            return;
                        } else {
                            // Error
                            console.log(err);

                            res.status(500).send({
                                    "result": "error",
                                    "msg": "Sorry. Something didn\'t work out."
                                });
                            return;
                        }

                    } else {
                        console.log('ERROR: Couldn\'t create the campaign record in the database.');
                        res.status(500).send('There was a problem with the database connection.');
                        return;
                    }
        });
    }
}








/*-----------------------------------------------------------------------------
  Add or update a subscriber:
  -----------------------------------------------------------------------------*/

async function doSubscribe(req, res, next) {

    if (req.body.free_hunny!=="") {
        res.status(401).send("You've been a naughty bot.");
        return;
    }

    const senderGroups = await fetch('https://api.sender.net/v2/groups?limit=100', { headers: senderApiHeaders }).then(response => response.json());
    if (senderGroups.sucess===false) {
        throw 'Could not fetch groups: '+senderGroups.message;
    }

    const eligibleGroups = ["Virtual", "Europe", "Middle-East", "Africa", "South Asia",
                            "South-East Asia", "East Asia", "Oceania", "North America",
                            "South America", "Procrastinators"];

    // If req.body.groups is a string, convert it to an array
    const groups = [].concat(req.body.groups)
        // ... and return the intersection of req.body.groups and eligibleGroups, to
        // prevent people from signing up to arbitrary groups, like "Moderators":
        .filter(grpName => eligibleGroups.includes(grpName))
        .map(grpName => { return senderGroups.data.find(grp => grp.title.toLowerCase()===grpName.toLowerCase()).id; });

    var data = {
        "email": req.body.email,
        "firstname": req.body.firstname,
        "lastname": req.body.lastname,
        "groups": groups,
        "fields": {}
    };

    // Update existing subscriber?
    if (req.body.key) {

        try {
            // First, validate that we have the correct SHA256 key
            const subscriber = await fetch("https://api.sender.net/v2/subscribers/" + encodeURIComponent(req.body.email), {
                method: "GET",
                headers: senderApiHeaders
            }).then(response => response.json());

            if(subscriber.data.columns.find(col => col.title==="sha256").value !== req.body.key) {
                res.status(401).send("Subscriber key does not match.");
                return;
            };

            // PATCH the existing subscriber
            const result = await fetch("https://api.sender.net/v2/subscribers/" + encodeURIComponent(req.body.email), {
                method: "PATCH",
                headers: senderApiHeaders,
                body: JSON.stringify(data)
            }).then(response => response.json());

            if (!result.success) {
                res.status(401).send(result.message);
                return;
            }

            // DELETE subscriber from groups (gee thanks, Sender.net)
            subscriber.data.subscriber_tags
                // exclude "Moderators", "TEST", etc
                .filter(grp => eligibleGroups.includes(grp.title))
                // find groups that are no longer in data.groups
                .filter(grp => !groups.includes(grp.id))
                .forEach(grp => {
                    // ... and remove the user from each group, one by one.
                    // I'm intentionally doing this async. No plans on hanging around to see how it goes.
                    fetch("https://api.sender.net/v2/subscribers/groups/" + encodeURIComponent(grp.id), {
                        method: "DELETE",
                        headers: senderApiHeaders,
                        body: JSON.stringify({ "subscribers": [req.body.email] })
                    }).then(response => response.json());
                });



            if (result.success) {
                res.sendStatus(200);
            } else {
                res.status(401).send(result.message);
            }

        } catch (err) {
            console.log(err);
            res.sendStatus(500);
        }

    }
    // ... or create a new subscriber?
    else {

        data.email=req.body.email;
        data.fields.sha256 = emailHash(req.body.email);

        try {
            // POST the new subscriber
            const result = await fetch("https://api.sender.net/v2/subscribers", {
                method: "POST",
                headers: senderApiHeaders,
                body: JSON.stringify(data)
            }).then(response => response.json());

            if (result.success) {
                res.sendStatus(200);
            } else {
                res.status(401).send(result.message);
            }
        } catch (err) {
            console.log(err);
            res.sendStatus(500);
        }

    }

}










/*-----------------------------------------------------------------------------
  Modify an event request from the moderation interface:
  -----------------------------------------------------------------------------*/

function doModifyRequest(req, res, next) {

    var formEventDate;
    try {
        eventDateComponents = req.body["event-date"].split("-");
        formEventDate=new Date(Date.UTC(
            parseInt(eventDateComponents[0]),
            parseInt(eventDateComponents[1])-1,
            parseInt(eventDateComponents[2]))
        ).toISOString().split("T")[0];
    } catch(err) {
        console.log(err);
        res.status(400).send('That\'s odd.');
        return;
    }

    var formEventEndDate;
    try {
        eventEndDateComponents = req.body["event-end-date"].split("-");
        formEventEndDate=new Date(Date.UTC(
            parseInt(eventEndDateComponents[0]),
            parseInt(eventEndDateComponents[1])-1,
            parseInt(eventEndDateComponents[2]))
        ).toISOString().split("T")[0];
    } catch(err) {
    }

    // Save the everything to the SQL Server table:
    try {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE CallForDataSpeakers.Update_Campaign @Token=@Token, @Name=@Name, @Email=@Email, @EventName=@EventName, @EventType=@EventType, @Regions=@Regions, @Venue=@Venue, @Date=@Date, @EndDate=@EndDate, @URL=@URL, @Information=@Information;',
            [   { "name": 'Token',   "type": Types.NVarChar, "value": req.params.token},
                { "name": 'Name',    "type": Types.NVarChar, "value": req.body.name },
                { "name": 'Email',   "type": Types.NVarChar, "value": req.body.email },
                { "name": 'EventName', "type": Types.NVarChar, "value": req.body.event },
                { "name": 'EventType', "type": Types.NVarChar, "value": req.body.types.join(",") },
                { "name": 'Regions', "type": Types.NVarChar, "value": req.body.groups.join(",") },
                { "name": 'Venue',   "type": Types.NVarChar, "value": req.body.venue },
                { "name": 'Date',    "type": Types.Date,     "value": formEventDate },
                { "name": 'EndDate', "type": Types.Date,     "value": formEventEndDate },
                { "name": 'URL',     "type": Types.NVarChar, "value": req.body.url },
                { "name": 'Information', "type": Types.NVarChar, "value": req.body.info }],

                // The stored procedure will return a uniqueidentifier (Token), used to identify
                // each event request:
                function(recordset) {
                    if (recordset.data) {
                        res.status(200).send('ok');
                    } else {
                        console.log('ERROR: Couldn\'t create the campain record in the database.');
                        res.status(404).send('There was a problem with the database connection.');
                        return;
                    }
        });
    } catch(e) {
        res.status(500).send('There was a problem with the database connection.');
    }
}



/*-----------------------------------------------------------------------------
  Approve an event request, send campaign to speakers:
  -----------------------------------------------------------------------------*/

function doApproveRequest(req, res, next) {

    httpHeaders(res);

    // The part of the URL that reflects the token:
    var token=req.params.token;

    // Approve the campaign in the database and retrieve the event information:
    cannedSql.sqlQuery(connectionString,
        'EXECUTE CallForDataSpeakers.Approve_Campaign @Token=@Token;',
        [   { "name": 'Token', "type": Types.NVarChar, "value": token }],

            async function(recordset) {
                if (recordset.data) {
                    var eventDateString=friendlyDateRange(
                        recordset.data[0].Date, 
                        recordset.data[0].EndDate,
                        " until ");

                    var eventInfoString=recordset.data[0].Information || "";
                    if (eventInfoString.length>0 && !/[\.!?]/.test(eventInfoString.substring(eventInfoString.length-1))) {
                        eventInfoString+=".";
                    }

                    // If the only region is "Virtual", this is a virtual event.
                    // If there are other regions, but they include "Virtual", this is a hybrid event.
                    // If there's no "Virtual" region, this is an in-person event.
                    var eventVirtualString;
                    if (recordset.data[0].Regions.toUpperCase().replace(' ', '').split(',')=='VIRTUAL') {
                        eventVirtualString='This is a virtual event';
                    }
                    else if (recordset.data[0].Regions.toUpperCase().replace(' ', '').split(',').includes('VIRTUAL')) {
                        eventVirtualString='This is an in-person event, but may also accept virtual session abtracts.';
                    }
                    else {
                        eventVirtualString='This is an in-person event.';
                    }

                    var cfsURL = recordset.data[0].URL;

                    var calendarLink='';
                    if (cfsURL.toLowerCase().indexOf('sessionize.com/')>0) {
                        calendarLink='<a href="'+cfsURL.replace('sessionize.com/', 'sessionize.com/add-to-calendar/cfs/')+'" style="text-decoration: underline; color: #000000;">Add to my calendar</a>';
                    }

                    // These are the values that we want to fill into our template:
                    var templateSections={
                        "event-name": encodeHtml(recordset.data[0].EventName),
                        "event-date": eventDateString,
                        "event-virtual": eventVirtualString,
                        "event-venue": encodeHtml(recordset.data[0].Venue),
                        "event-type": encodeHtml(recordset.data[0].EventType.split(",").join(", ")),
                        "name": encodeHtml(recordset.data[0].Name),
                        "organizer-email": encodeHtml(recordset.data[0].Email),
                        "event-information": encodeHtml(eventInfoString),
                        "cfs-url": cfsURL+(cfsURL.toLowerCase().indexOf('utm_source')==-1 ? (cfsURL.indexOf('?')==-1 ? '?' : '&')+'utm_source=callfordataspeakers&utm_campaign=speaker-email' : ''),
                        "calendar-url": calendarLink
                    };

                    // Send the email campaign to all our subscribers:
                    if (await sendCampaign(
                                recordset.data[0].Regions,      // Region group members
                                "email-call-for-speakers.html", // Template name
                                templateSections,               // Values to template fields
                                'Call for speakers: '+recordset.data[0].EventName,   // Subject line
                                recordset.data[0].EventName+' is coming to you on '+eventDateString+'. The call for speakers is open!')) // Preview
                    {
                        // Success:
                        const mastodonUrl = cfsURL+(cfsURL.toLowerCase().indexOf('utm_source')==-1 ? (cfsURL.indexOf('?')==-1 ? '?' : '&')+'utm_source=callfordataspeakers&utm_campaign=mastodon' : '');

                        // Post to Mastodon (if one is configured in the
                        // environment variables)
                        if (process.env.mastodon_access_token && !isTestEnvironment) {
                            postToMastodon("Call for speakers: "+recordset.data[0].EventName+"\n\n"+mastodonUrl);
                        }

                        const blueskyUrl = cfsURL+(cfsURL.toLowerCase().indexOf('utm_source')==-1 ? (cfsURL.indexOf('?')==-1 ? '?' : '&')+'utm_source=callfordataspeakers&utm_campaign=bluesky' : '');

                        // Post to Bluesky (if one is configured in the
                        // environment variables)
                        if (process.env.bluesky_password && !isTestEnvironment) {
                            postToBluesky("Call for speakers: "+recordset.data[0].EventName+"\n\n"+blueskyUrl);
                        }

                        res.status(200).send({
                            "subject": "Campaign sent",
                            "message": "Your campaign has been scheduled and will be sent out."
                        });
                        return;
                    } else {
                    // Or not:
                        res.status(500).json(err);
                        return;
                    }
                } else {
                    console.log('Invalid token: '+token+'.');
                    res.status(404).send({
                        "subject": "Nope",
                        "message": "That token is invalid or already used."
                    });
                    return;
                }
    });

}






/*-----------------------------------------------------------------------------
  Send procrastinator's digest email:
  -----------------------------------------------------------------------------*/

function sendDigestCampaign(req, res, next) {

    httpHeaders(res);

    // The part of the URL that reflects the API key:
    if (req.params.apikey==process.env.apikey) {

        // Fetch events whose call for speakers closes in 3-10 days
        cannedSql.sqlQuery(connectionString,
            'SELECT EventName, [URL], Regions\n'+
            'FROM CallForDataSpeakers.Feed\n'+
            'WHERE Cfs_Closes>=DATEADD(hour, 36, SYSUTCDATETIME())\n'+
            '  AND Cfs_Closes<DATEADD(hour, 36+7*24, SYSUTCDATETIME())\n'+
            'ORDER BY Cfs_Closes;', [],

                async function(recordset) {
                    if (recordset.data.length>0) {
                        const htmlList = recordset.data.map(row => {
                            const url = row.URL+(row.URL.toLowerCase().indexOf('utm_source')==-1 ? (row.URL.indexOf('?')==-1 ? '?' : '&')+'utm_source=callfordataspeakers&utm_campaign=digest' : '');
                            const regions = row.Regions.split(",").map(r => " <div class=\"tag\">"+encodeHtml(r)+"</div>").join(" ");
                            return '<li><a href=\"'+encodeHtml(url)+'">'+encodeHtml(row.EventName)+"</a>"+regions+"</li>";
                        }).join("\n");

                        // Send the campaign to all our subscribers:
                        if (await sendCampaign(
                                    "Procrastinators",                              // Region group members
                                    "email-procrastinators-digest.html",            // Template name
                                    { "html-list": htmlList },                      // Values to template fields
                                    'Call for Data Speakers: Events closing soon',  // Subject line
                                    "Your Procrastinator\'s Digest: these events are closing their calls for speakers in the next few days.")) // Preview
                        {
                            // Success:
                            res.status(200).json({ "status": "ok" });
                            return;
                        } else {
                            // Or not:
                            console.log(err);
                            res.status(500).json({ "status": "Bad things have happened" });
                            return;
                        }
                    } else {
                        res.status(200).json({ "status": "nothing to send" });
                    }
                    return;
                });
    } else {
            console.log('Invalid token API key.');
            res.status(404).send({
                "status": "Not allowed"
            });
            return;
    }
}







/*-----------------------------------------------------------------------------
  REST API-ish to list events:
  -----------------------------------------------------------------------------*/

function listEvents(req, res, next) {

    httpHeaders(res);

    // Approve the campaign in the database and retrieve the event information:
    cannedSql.sqlQuery(connectionString,
        'SELECT EventName, EventType, Regions, Email, Venue, [Date], EndDate, [URL], Information, Cfs_Closes, Created, Lat, Long FROM CallForDataSpeakers.Feed ORDER BY [Date], Created;', [],

            async function(recordset) {

                res.status(200).json(recordset.data);
                return;
            });

}


/*-----------------------------------------------------------------------------
  API to fetch single event for moderation:
  -----------------------------------------------------------------------------*/

function getEvent(req, res, next) {

    httpHeaders(res);

    // Approve the campaign in the database and retrieve the event information:
    cannedSql.sqlQuery(connectionString,
        'SELECT Name, EventName, EventType, Regions, Email, Venue, [Date], EndDate, [URL], Information, Cfs_Closes, Created FROM CallForDataSpeakers.Campaigns WHERE Token=@Token AND Sent IS NULL;',
        [   { "name": 'Token', "type": Types.NVarChar, "value": req.params.token }],

            async function(recordset) {
                if (recordset.data.length>0) {
                    if (recordset.data[0].URL.toLowerCase().indexOf('sessionize.com/')>-1 && process.env.sessionize_apikey) {
                        blob=await fetchSessionizeEvent(recordset.data[0].URL);
                        if (blob) {
                            recordset.data[0].Sessionize=blob;
                        }
                    }

                    res.status(200).json(recordset.data);
                    return;
                } else {
                    res.status(500).send('');
                }
            });

}

/*-----------------------------------------------------------------------------
  List events:
  -----------------------------------------------------------------------------*/

function listPage(req, res, next) {

    httpHeaders(res);

    res.status(200).send(createHTML('list.html', {}));
    return;

}

/*-----------------------------------------------------------------------------
  List precon speakers:
  -----------------------------------------------------------------------------*/

function preconPage(req, res, next) {

    httpHeaders(res);

    res.status(200).send(createHTML('precon.html', {}));
    return;

}









/*-----------------------------------------------------------------------------
  RSS feed:
  -----------------------------------------------------------------------------*/

async function getRssFeed(req, res, next) {

    var items='';
    cannedSql.sqlQuery(connectionString,
        'SELECT EventName, EventType, Regions, Email, Venue, [Date], [URL], Information, Created, DATEDIFF_BIG(second, {d \'1970-01-01\'}, Created) AS uid FROM CallForDataSpeakers.Feed ORDER BY Created DESC;', [],

            async function(recordset) {

                var lastBuildDate=new Date(Date.now())

                recordset.data.forEach(item => {

                    var eventDate=item.Date.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });            

                    items+='<item>\n'+
                            '<title>'+encodeHtml(item.EventName)+'</title>\n'+
                            '<link>'+item.URL+(item.URL.toLowerCase().indexOf('utm_source')==-1 ? (item.URL.indexOf('?')==-1 ? '?' : '&')+'utm_source=callfordataspeakers&utm_campaign=rss-feed' : '')+'</link>\n'+
                            '<dc:creator>Call for Data Speakers</dc:creator>\n'+
                            '<pubDate>' + item.Created.toUTCString() + '</pubDate>\n'+
                            '<category>Call for Speakers</category>\n'+
                            '<guid isPermaLink="false">'+item.uid+'</guid>\n'+
                            '<description><![CDATA['+encodeHtml(item.EventName)+']]></description>\n'+
                            '<content:encoded><![CDATA['+
                                encodeHtml(item.EventName)+' is coming to you on '+eventDate+'<br/>\n'+
                                'The <a href="'+item.URL+(item.URL.toLowerCase().indexOf('utm_source')==-1 ? (item.URL.indexOf('?')==-1 ? '?' : '&')+'utm_source=callfordataspeakers&utm_campaign=rss-feed' : '')+'">call for speakers</a> is open.\n'+
                                ']]></content:encoded>\n'+
                            '<media:content url="https://'+req.hostname+'/assets/callfordataspeakers-logo.png" medium="image">\n'+
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
}


// https://stackoverflow.com/a/57448862/5471286
const encodeHtml = str => str.replace(/[&<>'"]/g, 
  tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag]));








/*-----------------------------------------------------------------------------
  Sync subscriber count to a local JSON file that we can use to display the
  count on each page.
  -----------------------------------------------------------------------------*/

async function syncSubscriberCount(req, res, next) {

    if (req.params.apikey==process.env.apikey) {

        try {
            // Update subscriber count:
            getSubscriberCount();

            // Update campaign/email count:
            getCampaignCount();

            res.status(200).json({ "status": "ok" });
        } catch(err) {
            res.status(500).json({ "status": "error" });
        }

    } else {
        res.status(401).json({ "status": "invalid authenticator" });
    }

}

async function getSubscriberCount() {

    // We don't want to include groups like "Moderators", "Procrastinators", or "TEST".
    const eligibleGroups = ["Virtual", "Europe", "Middle-East", "Africa", "South Asia",
                            "South-East Asia", "East Asia", "Oceania", "North America",
                            "South America"];

    // How many subscribers for each region group?
    const groups = await fetch('https://api.sender.net/v2/groups?limit=100', { headers: senderApiHeaders }).then(response => response.json());

    const subscriberCount = groups.data
        .filter(grp => eligibleGroups.includes(grp.title))
        .map(grp => {
            return {
                "name": grp.title,
                "subscriber_count": grp.active_subscribers
            };
        });

    // Write to file
    fs.writeFileSync(__dirname + '/assets/subscriber-count.json', JSON.stringify(subscriberCount));
}

async function getCampaignCount() {

    var page=1;
    var pageSize=1000;
    var done=false;

    var campaignCount=parseInt(process.env.legacy_campaign_count) || 0;
    var emailCount=parseInt(process.env.legacy_email_count) || 0;

    while (!done) {
        const campaigns = await fetch('https://api.sender.net/v2/campaigns?limit='+pageSize+'&status=SENT&page='+page, { headers: senderApiHeaders }).then(response => response.json());
        const cfsCampaigns = campaigns.data.filter(c => /^Call for speakers: /.test(c.subject) && !/closing soon/.test(c.subject));

        campaignCount += cfsCampaigns.length;
        emailCount    += cfsCampaigns.reduce((accumulator, campaign) => accumulator + campaign.sent_count, 0);

        if (campaigns.data.length===0) { done=true; }
        page++;
    }

    fs.writeFileSync(__dirname + '/assets/campaign-count.json', JSON.stringify({
        "campaigns": campaignCount,
        "emails": emailCount
    }));
}


/*-----------------------------------------------------------------------------
  Fetch event information from Sessionize:
  -----------------------------------------------------------------------------*/

async function getSessionizeDetails(req, res, next) {
    var details={};
    try {
        details=await fetchSessionizeEvent(req.query.url);
        res.status(200).send(JSON.stringify({
            "URL": details.cfpLink,
            "EventName": details.name,
            "Date": details.eventDates.start,
            "EndDate": details.eventDates.end,
            "Venue": (details.location ? details.location.full : ''),
            "Cfs_Closes": (new Date(details.cfpDates.endUtc+"Z")).getTime().toString()
        }));
    } catch(e) {
        res.status(404).send('');
    }
}



/*-----------------------------------------------------------------------------
  Sync call-for-speakers closing dates from Sessionize:
  -----------------------------------------------------------------------------*/

async function doSyncSessionize(req, res, next) {
    if (req.params.apikey==process.env.apikey) {
        await updateCfsCloseDates(res);
    } else {
        console.log('Invalid API key for /api/sync-sessionize');
        res.status(401).send('Invalid API key');
    }
}

async function updateCfsCloseDates(res) {

    // Check the closing dates for Sessionize CfS where
    // 1) there isn't one yet (new event), or
    // 2) it's Sunday (check all of them once a week, in case they change)
    cannedSql.sqlQuery(connectionString,
        'SELECT Token, [URL], Cfs_Closes '+
        'FROM CallForDataSpeakers.Campaigns '+
        'WHERE [Date]>SYSUTCDATETIME() '+
        '  AND [URL] LIKE \'https://sessionize.com/_%\' '+
        '  AND ISNULL(Cfs_Closes, {d \'2099-12-31\'})>DATEADD(day, -14, SYSDATETIME());', [],
        function(recordset) {
            recordset.data.forEach(async function(record) {
                console.log(record.URL);
                const cfs=await fetchSessionizeEvent(record.URL);
                if (cfs.error==="Not found") {
                    // If the Sessionize URL no longer exists, "un-send" the event (hide it from the list)
                    cannedSql.sqlQuery(connectionString,
                        'EXECUTE CallForDataSpeakers.Hide_Event @Token=@Token;',
                        [   { "name": 'Token',      "type": Types.NVarChar, "value": record.Token }],
                        function(recordset) {});
                } else {
                    const formattedUtcTime=cfs.cfpDates.endUtc.replace('T', ' ');
                    const coords=(cfs.location ? cfs.location.coordinates.split(",") : []);

                    // Update Cfs closing time and, if available, the lat/long from Sessionize:
                    cannedSql.sqlQuery(connectionString,
                        'EXECUTE CallForDataSpeakers.Update_CfsClose @Token=@Token, @Cfs_Closes=@Cfs_Closes, @Lat=@Lat, @Long=@Long;',
                        [   { "name": 'Token',      "type": Types.NVarChar, "value": record.Token },
                            { "name": 'Cfs_Closes', "type": Types.NVarChar, "value": formattedUtcTime },
                            { "name": 'Lat',        "type": Types.Numeric, "value": (coords ? coords[0] : null) },
                            { "name": 'Long',       "type": Types.Numeric, "value": (coords ? coords[1] : null) }
                        ],
                        function(recordset) {});
                }

            });
    });

    res.status(200).send('OK');
}



/*-----------------------------------------------------------------------------
  Other related assets, like client-side JS, CSS, images, whatever:
-----------------------------------------------------------------------------*/

function getAsset(req, res, next) {

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
}







/*-----------------------------------------------------------------------------
  Format the HTML template:
  -----------------------------------------------------------------------------*/

function createHTML(templateFile, values) {
    var rn=Math.random();

    // Read the template file:
    var htmlTemplate = fs.readFileSync(path.resolve(__dirname, './assets/'+templateFile), 'utf8').toString();

    // Apparently, tabs mess with some HTML renderers, who knew...
    htmlTemplate=htmlTemplate.split("\t").join(" ");

    // Loop through the JSON blob given as the argument to this function,
    // replace all occurrences of <%=param%> in the template with their
    // respective values.
    for (var param in values) {
        if (values.hasOwnProperty(param)) {
            const value=values[param];
            if (typeof value==="string") {
                htmlTemplate = htmlTemplate.split("\<\%\="+param+"\%\>").join(value);
            } else {
                for (key of value) {
                    htmlTemplate = htmlTemplate.split("\<\%\="+param+":"+key+"\%\>").join(" checked");
                }
            }
        }
    }

    // Special parameter that contains a random number (for caching reasons):
    htmlTemplate = htmlTemplate.split('\<\%\=rand\%\>').join(rn);

    // Clean up any remaining parameters in the template
    // that we haven't replaced with values from the JSON argument:
    htmlTemplate = htmlTemplate.replace(/<%=([\s\S]*?)%>/g, "");

    // DONE.
    return(htmlTemplate);
}





/*-----------------------------------------------------------------------------
  Send campaign: Returns true if successful
  -----------------------------------------------------------------------------*/

async function sendCampaign(regions, templateName, templateSections, subjectLine, previewText) {

    // Fetch groups for each of the regions
    const groups = await fetch('https://api.sender.net/v2/groups?limit=100', { headers: senderApiHeaders }).then(response => response.json());
    if (groups.sucess===false) {
        throw 'Could not fetch groups: '+groups.message;
    }

    if (isTestEnvironment) {
        regions="TEST";
        console.log("WARNING: Overriding region. Setting to \”TEST\".");
    }

    const regionList = regions
        .toUpperCase()
        .split("-").join("")
        .split(" ").join("")
        .split(",");

    const groupIds = groups.data
        .filter(grp => regionList.indexOf(grp.title.toUpperCase().replace("-", "").replace(" ", ""))>=0)
        .map(grp => grp.id);

    if (groupIds.length!==regions.split(",").length || groupIds.length===0) {
        throw new Error("Group count is zero, or does not match the target region count.");
    }

    // Load the email template
    const templateCSS = fs.readFileSync(__dirname + "/assets/email-template-style.css", { encoding: "utf8", flag: "r" });
    templateSections.stylesheet=templateCSS;
    templateSections.preview=previewText;

    // Populate the email template
    templateSections.subject=subjectLine;
    const htmlContent=createHTML(templateName, templateSections);

    // Construct the API call and create the campaign
    data = {
        "title": subjectLine,
        "subject": subjectLine,
        "from": "Call for Data Speakers",
        "reply_to": senderEmail,
        "preheader": previewText,
        "content_type": "html",
        "google_analytics": 0,
        "auto_followup_active": false,
        "groups": groupIds,
        "content": htmlContent
    };

    const campaign = await fetch("https://api.sender.net/v2/campaigns", {
        method: "POST",
        headers: senderApiHeaders,
        body: JSON.stringify(data)
    }).then(response => response.json());

    if (campaign.sucess===false) {
        throw 'Could not create campaign: '+campaign.message;
    }

    const campaignId = campaign.data.id;

    // Send the campaign
    const sendStatus = await fetch("https://api.sender.net/v2/campaigns/"+campaignId+"/send", {
        method: "POST",
        headers: senderApiHeaders
    }).then(response => response.json());

    if (sendStatus.sucess===false) {
        throw 'Could not send campaign: '+sendStatus.message;
    }

    console.log((new Date), "Sent campaign: "+subjectLine);
    return sendStatus.success;
}




/*-----------------------------------------------------------------------------
  Post the call for speakers to Mastodon:
  -----------------------------------------------------------------------------*/

async function postToMastodon(message) {

    return new Promise((resolve, reject) => {

        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        };

        const postReq = https.request(
                'https://'+process.env.mastodon_server+'/api/v1/statuses?access_token='+encodeURIComponent(process.env.mastodon_access_token),
                options,
                (res) => {
            if (res.statusCode>204) {
                return reject(new Error('mastodon_status='+res.statusCode));
            }

            const body = [];
            res.on('data', (chunk) => body.push(chunk));
            res.on('end', () => {

                var resBlob;
                try {
                    resBlob = JSON.parse(Buffer.concat(body).toString());
                } catch {
                    //
                }
                resolve(resBlob);
            });
        })

        postReq.on('error', (err) => {
            reject(err);
        })

        postReq.on('timeout', () => {
            postReq.destroy();
            reject(new Error('Request time out'));
        })

        postReq.write('status='+encodeURIComponent(message), 'UTF-8');
        postReq.end();
    });
}



/*-----------------------------------------------------------------------------
  Post the call for speakers to Bluesky:
  -----------------------------------------------------------------------------*/

// Thanks: https://ashevat.medium.com/how-to-build-a-bluesky-bot-using-atproto-and-openai-api-77a26a154b
async function postToBluesky(message) {

    const {RichText} = blue;
    const {BskyAgent} = blue;

    const agent = new BskyAgent({
        service: 'https://bsky.social/'
    });

    await agent.login({
        identifier: process.env.bluesky_email,
        password: process.env.bluesky_password
    });

    const rt = new RichText({
        text: message
    });

    await rt.detectFacets(agent) // automatically detects mentions and links

    const postRecord = {
        $type: 'app.bsky.feed.post',
        text: rt.text,
        facets: rt.facets,
        createdAt: new Date().toISOString()
    };
    await agent.post(postRecord);
}









/*-----------------------------------------------------------------------------
  Standardized HTTP headers:
  -----------------------------------------------------------------------------*/

function httpHeaders(res) {
    // The "preload" directive also enables the site to be pinned (HSTS with Preload)
    const hstsPreloadHeader = 'max-age=31536000; includeSubDomains; preload'
    res.header('Strict-Transport-Security', hstsPreloadHeader); // HTTP Strict Transport Security with preload

    // Don't apply the CSP header to image/script/css assets, and not to API calls:
    if (['png', 'jpg', 'jpeg', 'gif', 'css', 'js', 'json'].indexOf(res.req.originalUrl.split(".").reverse()[0].toLowerCase())==-1 &&
        res.req.originalUrl.toLowerCase().indexOf('/api/')==-1) {

        // Limits use of external script/css/image resources
        res.header('Content-Security-Policy', "default-src https: 'self'; style-src 'self'; script-src 'self' https://static.cloudflareinsights.com;");
    }

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





/*-----------------------------------------------------------------------------
  Fetch sessionize event information:
  -----------------------------------------------------------------------------*/

async function fetchSessionizeEvent(sessionizeUrl) {

    sessionizeUrl=sessionizeUrl.toLowerCase();

    const url='https://sessionize.callfordataspeakers.com/?'+
        'apikey='+process.env.sessionize_apikey+'&'+
        'event='+sessionizeUrl.substring(sessionizeUrl.indexOf('sessionize.com/')+15, 100).split('/')[0];

    try {
        return new Promise((resolve, reject) => {
            const req = https.request(url, { method: 'GET' }, (res) => {
                if (res.statusCode>204) {
                    return reject(new Error('status='+res.statusCode));
                }

                const body = [];
                res.on('data', (chunk) => body.push(chunk));
                res.on('end', () => {
                    var resBlob;
                    resBlob = Buffer.concat(body).toString();
                    resolve(JSON.parse(resBlob));
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request time out'));
            });

            req.end();
        });
    } catch(e) {
        return {};
    }

}


/*-----------------------------------------------------------------------------
  Hash email address (with salt) with SHA256. This digest is used to authenticate
  users when they open the /modify page to change their registration.
  -----------------------------------------------------------------------------*/

function emailHash(email) {
    return crypto.createHash("sha256").update(email+":"+process.env.email_hash_salt).digest("hex");
}



/*-----------------------------------------------------------------------------
  Friendly formatting for date ranges.
  -----------------------------------------------------------------------------*/

function friendlyDateRange(fromDate, toDate, separator) {
    toDate = toDate || fromDate;
    separator = separator || " - ";

    var friendlyDate;

    if (fromDate===toDate) {
        // Single date
        friendlyDate=fromDate.toLocaleDateString("en-US", {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
    } else if (fromDate.getUTCFullYear()===toDate.getUTCFullYear()) {
        if (fromDate.getUTCMonth()===toDate.getUTCMonth()) {
            // Same year & month
            friendlyDate=fromDate.toLocaleDateString("en-US", {
                    month: 'long',
                    day: 'numeric'
                })+separator+toDate.toLocaleDateString("en-US", {
                    day: 'numeric'
                })+", "+toDate.toLocaleDateString("en-US", {
                    year: 'numeric'
                });

        } else {
            // Same year, different month
            friendlyDate=fromDate.toLocaleDateString("en-US", {
                    month: 'long',
                    day: 'numeric'
                })+separator+toDate.toLocaleDateString("en-US", {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
        }
    } else {
        // Different year
            friendlyDate=fromDate.toLocaleDateString("en-US", {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                })+separator+toDate.toLocaleDateString("en-US", {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
    }

    return friendlyDate;
}


