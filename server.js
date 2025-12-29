#!/usr/bin/env node

const validUrl=/^(http|https):\/\/.{1,}\..{1,}/gi;




// Core modules:
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const url = require('url');
const https = require('https');

// Other modules:
const express = require('express');
const bodyParser = require('body-parser');

// Mailchimp Marketing API
const mailchimp = require("@mailchimp/mailchimp_marketing");
// Canned SQL
const cannedSql=require('./canned-sql.js');


mailchimp.setConfig({
    apiKey: process.env.mcapikey,
    server: process.env.mcapikey.split("-")[1],
});

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
app.listen(serverPort, () => console.log('READY.'));








/*-----------------------------------------------------------------------------
  Azure Linux App Service Plan health check request:
  ---------------------------------------------------------------------------*/

app.get('/robots933456.txt', function (req, res, next) {
    console.log("Azure health check: OK.");
    res.status(200).send("OK");
});




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

app.all('/event', function (req, res, next) {

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
});







/*-----------------------------------------------------------------------------
  Event request moderation
-----------------------------------------------------------------------------*/

app.get('/moderate/:token', function (req, res, next) {

    httpHeaders(res);

    // Serve up assets/event.html:
    res.status(200).send(createHTML('moderate.html', {}));
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
        res.status(404).send("Nice try, bot.");
        return;
    }

    // Could be GET or POST, so we'll check both:
    var formName=(queryParams.FNAME || req.body.FNAME)+' '+(queryParams.LNAME || req.body.LNAME);
    var formEmail=req.body.EMAIL || queryParams.EMAIL;
    var formEventName=req.body.EVENT || queryParams.EVENT;
    var formEventVenue=req.body.VENUE || queryParams.VENUE;

    var formEventDate;
    try {
        formEventDate=new Date(
            (queryParams["EVENTDATE[year]"] || req.body["EVENTDATE[year]"])+'-'+
            (queryParams["EVENTDATE[month]"] || req.body["EVENTDATE[month]"])+'-'+
            (queryParams["EVENTDATE[day]"] || req.body["EVENTDATE[day]"])+' 00:00:00+00:00').toISOString().split("T")[0];
    } catch(err) {
        res.status(400).send("Input validation failed on EVENTDATE parameters.");
        return;
    }

    var formEventEndDate;
    try {
        formEventEndDate=new Date(
            (queryParams["EVENTENDDATE[year]"] || req.body["EVENTENDDATE[year]"])+'-'+
            (queryParams["EVENTENDDATE[month]"] || req.body["EVENTENDDATE[month]"])+'-'+
            (queryParams["EVENTENDDATE[day]"] || req.body["EVENTENDDATE[day]"])+' 00:00:00+00:00').toISOString().split("T")[0];
    } catch(err) {
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

                        // Create an email to all moderators, requesting event approval:
                        var approveButton='<a class="mcnButton" title="Review" href="https://'+req.hostname+'/moderate/'+recordset.data[0].Token+'" '+
                                                'target="_blank" style="font-weight:normal;letter-spacing:normal;line-height:100%;text-align:center;'+
                                                'text-decoration:none;color:#000000;">Review</a>';


                        // These are the "mc:edit" values that we want to fill into our template:
                        var templateSections={
                            "name": formName,
                            "event_email": formEmail,
                            "event_regions": formEventRegions,
                            "event_name": formEventName,
                            "event_type": formEventType,
                            "event_venue": formEventVenue,
                            "event_date": formEventDate + (formEventEndDate ? ' -> ' + formEventEndDate : ''),
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
  Modify an event request from the moderation interface:
-----------------------------------------------------------------------------*/

// Save any changes to the request before sending it out
app.post('/api/update/:token', function(req, res, next) {

    console.log('1');

    var formEventDate;
    try {
        formEventDate=new Date(
            req.body["EVENTDATE[year]"]+'-'+
            req.body["EVENTDATE[month]"]+'-'+
            req.body["EVENTDATE[day]"]+' 00:00:00+00:00').toISOString().split("T")[0];
        console.log('1a');
    } catch(err) {
        console.log('1b');
        console.log(err);
        res.status(400).send('That\'s odd.');
        return;
    }

    console.log('2');

    var formEventEndDate;
    try {
        formEventEndDate=new Date(
            req.body["EVENTENDDATE[year]"]+'-'+
            req.body["EVENTENDDATE[month]"]+'-'+
            req.body["EVENTENDDATE[day]"]+' 00:00:00+00:00').toISOString().split("T")[0];
    } catch(err) {
    }

    console.log('3');

    console.log('eventDate:', formEventDate);
    console.log('eventEndDate:', formEventEndDate);

    // Save the everything to the SQL Server table:
    try {
        cannedSql.sqlQuery(connectionString,
            'EXECUTE CallForDataSpeakers.Update_Campaign @Token=@Token, @Name=@Name, @Email=@Email, @EventName=@EventName, @EventType=@EventType, @Regions=@Regions, @Venue=@Venue, @Date=@Date, @EndDate=@EndDate, @URL=@URL, @Information=@Information;',
            [   { "name": 'Token',   "type": Types.NVarChar, "value": req.params.token},
                { "name": 'Name',    "type": Types.NVarChar, "value": req.body.NAME },
                { "name": 'Email',   "type": Types.NVarChar, "value": req.body.EMAIL },
                { "name": 'EventName', "type": Types.NVarChar, "value": req.body.EVENT },
                { "name": 'EventType', "type": Types.NVarChar, "value": req.body.TYPE },
                { "name": 'Regions', "type": Types.NVarChar, "value": req.body.REGION },
                { "name": 'Venue',   "type": Types.NVarChar, "value": req.body.VENUE },
                { "name": 'Date',    "type": Types.Date,     "value": formEventDate },
                { "name": 'EndDate', "type": Types.Date,     "value": formEventEndDate },
                { "name": 'URL',     "type": Types.NVarChar, "value": req.body.URL },
                { "name": 'Information', "type": Types.NVarChar, "value": req.body.INFO }],

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
    cannedSql.sqlQuery(connectionString,
        'EXECUTE CallForDataSpeakers.Approve_Campaign @Token=@Token;',
        [   { "name": 'Token', "type": Types.NVarChar, "value": token }],

            async function(recordset) {
                if (recordset.data) {

                    var fromDate = recordset.data[0].Date;
                    var toDate = recordset.data[0].EndDate;

                    // formatting the event date; example: Tuesday, December 22, 2020"
                    var eventDateString=fromDate.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

                    // for a range of dates, construct a human-readable date interval text:
                    if (recordset.data[0].EndDate) {
                        if (recordset.data[0].Date != recordset.data[0].EndDate) {

                            // "Friday, May 17 until Saturday, May 18, 2024"
                            if (toDate.getFullYear() != fromDate.getFullYear()) {
                                eventDateString=fromDate.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) +
                                        ' until '+toDate.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                            }
                            // "Friday, May 17, 2024 until Saturday, May 18, 2024"
                            else {
                                eventDateString=fromDate.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) +
                                        ' until '+toDate.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                            }

                        }
                    }
                    
                    var eventInfoString=recordset.data[0].Information;
                    if (eventInfoString===null) { eventInfoString=''; }

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

                    // This is the button at the bottom of the email:
                    var eventButton='<a class="mcnButton" href="'+
                                            // Add UTM parameters
                                            cfsURL+(cfsURL.toLowerCase().indexOf('utm_source')==-1 ? (cfsURL.indexOf('?')==-1 ? '?' : '&')+'utm_source=callfordataspeakers&utm_campaign=speaker-email' : '')+'" '+
                                        'target="_blank" '+
                                        'style="font-weight:normal;letter-spacing:normal;line-height:100%;text-align:center;'+
                                        'text-decoration:none;color:#000000;">View the Call for Speakers</a>';

                    var calendarLink='';
                    if (cfsURL.toLowerCase().indexOf('sessionize.com/')>0) {
                        calendarLink='<a href="'+cfsURL.replace('sessionize.com/', 'sessionize.com/add-to-calendar/cfs/')+'" style="text-decoration: underline; color: #000000;">Add to my calendar</a>';
                    }

                    // These are the "mc:edit" values that we want to fill into our template:
                    var templateSections={
                        "event_name": recordset.data[0].EventName,
                        "event_date": eventDateString,
                        "event_virtual": eventVirtualString,
                        "event_venue": recordset.data[0].Venue,
                        "event_type": recordset.data[0].EventType,
                        "name": recordset.data[0].Name,
                        "event_email": recordset.data[0].Email,
                        "event_info": eventInfoString,
                        "event_button": eventButton,
                        "calendar_link": calendarLink
                    };

                    // Send the Mailchimp campaign to all our subscribers:
                    sendCampaign(process.env.speaker_audience,  // Audience
                                '',
                                process.env.campaign_template,  // Template name
                                true,                           // Tracking
                                true,                           // Tweet
                                recordset.data[0].Regions,      // Region group members
                                templateSections,               // Values to template fields
                                'hello@callfordataspeakers.com')        // Reply-to
                                'Call for speakers: '+recordset.data[0].EventName,   // Subject line
                                recordset.data[0].EventName+' is coming to you on '+eventDateString+'. The call for speakers is open!',      // Preview
                        )

                        // Success:
                        .then((cfsCampaignId) => {

                            // Post to Mastodon (if one is configured in the
                            // environment variables)
                            if (process.env.mastodon_access_token) {
                                postToMastodon('Call for speakers: '+recordset.data[0].EventName+
                                    ' - https://'+process.env.mcapikey.split('-')[1]+'.campaign-archive.com/?u='+
                                    process.env.mailchimp_social_identifer+'&id='+cfsCampaignId);
                            }

                            // Post to Bluesky (if one is configured in the
                            // environment variables)
                            if (process.env.bluesky_password) {
                                postToBluesky('Call for speakers: '+recordset.data[0].EventName+
                                    ' - https://'+process.env.mcapikey.split('-')[1]+'.campaign-archive.com/?u='+
                                    process.env.mailchimp_social_identifer+'&id='+cfsCampaignId);
                            }
        
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
  Send procrastinator's digest email:
  -----------------------------------------------------------------------------*/

app.get('/digest/:apikey', function (req, res, next) {

    httpHeaders(res);

    // The part of the URL that reflects the API key:
    if (req.params.apikey==process.env.apikey) {

        // Fetch events whose call for speakers closes in 3-10 days
        cannedSql.sqlQuery(connectionString,
            'SELECT EventName, [URL]\n'+
            'FROM CallForDataSpeakers.Feed\n'+
            'WHERE Cfs_Closes>=DATEADD(hour, 36, SYSUTCDATETIME())\n'+
            '  AND Cfs_Closes<DATEADD(hour, 36+7*24, SYSUTCDATETIME())\n'+
            'ORDER BY Cfs_Closes;', [],

                async function(recordset) {
                    if (recordset.data.length>0) {
                        const htmlList = recordset.data.map(row => {
                            const url = row.URL+(row.URL.toLowerCase().indexOf('utm_source')==-1 ? (row.URL.indexOf('?')==-1 ? '?' : '&')+'utm_source=callfordataspeakers&utm_campaign=digest' : '');
                            return '<li><a href=\"'+encodeHtml(url)+'">'+encodeHtml(row.EventName)+"</a></li>";
                        }).join("\n");

                        // Send the Mailchimp campaign to all our subscribers:
                        sendCampaign(process.env.speaker_audience,  // Audience
                                    process.env.digest_segment,     // Segment name
                                    undefined,                      // Region group members
                                    process.env.digest_template,    // Template name
                                    true,                           // Tracking
                                    false,                          // Tweet
                                    { "html_list": htmlList },      // Values to template fields
                                    'Call for Data Speakers: Events closing soon',   // Subject line
                                    "Your Procrastinator\'s Digest: these events are closing their calls for speakers in the next few days.",      // Preview
                                    'hello@callfordataspeakers.com')        // Reply-to

                            // Success:
                            .then((cfsCampaignId) => {
                                res.status(200).json({ "status": "ok", "campaignId": cfsCampaignId });
                                return;
                            })

                            // Or not:
                            .catch(err => {
                                console.log(err);
                                res.status(500).json({ "status": "Bad things have happened" });
                                return;
                            });                    
                    } else {
                        res.status(200).json({ "status": "nothing to send" });
                    }
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







/*-----------------------------------------------------------------------------
  REST API-ish to list events:
-----------------------------------------------------------------------------*/

app.get('/api/events', function (req, res, next) {

    httpHeaders(res);

    // Approve the campaign in the database and retrieve the event information:
    cannedSql.sqlQuery(connectionString,
        'SELECT EventName, EventType, Regions, Email, Venue, [Date], EndDate, [URL], Information, Cfs_Closes, Created, Lat, Long FROM CallForDataSpeakers.Feed ORDER BY [Date], Created;', [],

            async function(recordset) {

                res.status(200).json(recordset.data);
                return;
            });

});

app.get('/api/event/:token', function (req, res, next) {

    httpHeaders(res);

    // Approve the campaign in the database and retrieve the event information:
    cannedSql.sqlQuery(connectionString,
        'SELECT Name, EventName, EventType, Regions, Email, Venue, [Date], EndDate, [URL], Information, Cfs_Closes, Created FROM CallForDataSpeakers.Campaigns WHERE Token=@Token AND Sent IS NULL;',
        [   { "name": 'Token', "type": Types.NVarChar, "value": req.params.token }],

            async function(recordset) {
                if (recordset.data) {
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
  List precon speakers:
-----------------------------------------------------------------------------*/

app.get('/precon', function (req, res, next) {

    httpHeaders(res);

    res.status(200).send(createHTML('precon.html', {}));
    return;

});









/*-----------------------------------------------------------------------------
  RSS feed:
-----------------------------------------------------------------------------*/

app.get('/feed', async function (req, res, next) {

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
});


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
  List events:
-----------------------------------------------------------------------------*/

app.get('/api/sync-mailchimp/:apikey', async function (req, res, next) {

    if (req.params.apikey==process.env.apikey) {

        try {
            // Update subscriber count:
            var subscriberCount = await getSubscriberCount(process.env.speaker_audience);

            // Update campaign/email count:
            getCampaignCount(process.env.speaker_audience);

            res.status(200).json(subscriberCount);
        } catch(err) {
            res.status(500);
        }
        console.log('Done');

    } else {

        console.log('Invalid API key for /api/sync-mailchimp');
        res.status(401).send('Invalid API key');

    }

});





async function getSubscriberCount(listName) {
    var listId;
    var subscriberCount;
    var regions=[];

    // Find the "Speakers" list (the audience):
    const allLists = await mailchimp.lists.getAllLists({ "count": 100 });
    Array.from(allLists.lists).filter(list => list.name===listName).forEach(list => {
        listId=list.id;
        subscriberCount=list.stats.member_count;
    });

    // Find the "Regions" group:
    const allGroups = await mailchimp.lists.getListInterestCategories(listId);
    const groupId=Array.from(allGroups.categories).filter(group => group.title==="Region")[0].id;

    // Fetch all regions:
    var allGroupMembers=await mailchimp.lists.listInterestCategoryInterests(listId, groupId, {"count": 100});
    Array.from(allGroupMembers.interests).forEach(member => {
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

async function getCampaignCount(listName) {
    var offset=0;
    var pageSize=1000;
    var done=false;

    var campaignCount=0;
    var emailCount=0;

    while (!done) {
        // Fetch a page of campaigns:
        var allCampaigns = await mailchimp.campaigns.list({ "count": pageSize, "offset": offset });

        if (allCampaigns.campaigns.length>0) {
            Array.prototype.forEach.call(allCampaigns.campaigns, campaign => {
                if (campaign.recipients.list_name==listName) {
                    campaignCount++;
                    emailCount+=campaign.emails_sent;
                }
            });

            // Set the next page to fetch:
            offset+=pageSize;
            if (allCampaigns.campaigns.length<pageSize) { done=true; }
        } else {
            done=true;
        }
    }

    fs.writeFileSync(__dirname + '/assets/campaign-count.json', JSON.stringify({ "campaigns": campaignCount, "emails": emailCount }));
}



app.get('/api/get-sessionize', async function (req, res, next) {
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
});


app.get('/api/sync-sessionize/:apikey', async function (req, res, next) {
    if (req.params.apikey==process.env.apikey) {
        await updateCfsCloseDates(res);
    } else {
        console.log('Invalid API key for /api/sync-sessionize');
        res.status(401).send('Invalid API key');
    }
});

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
                var cfs=await fetchSessionizeEvent(record.URL)
                var formattedUtcTime=cfs.cfpDates.endUtc.replace('T', ' ');

                console.log(record.URL, formattedUtcTime);

                cannedSql.sqlQuery(connectionString,
                    'EXECUTE CallForDataSpeakers.Update_CfsClose @Token=@Token, @Cfs_Closes=@Cfs_Closes;',
                    [   { "name": 'Token',      "type": Types.NVarChar, "value": record.Token },
                        { "name": 'Cfs_Closes', "type": Types.NVarChar, "value": formattedUtcTime }],

                    function(recordset) {});

            });
    });

    res.status(200).send('OK');
}

        

async function getCalendar(url) {
    const options = {
        method: 'GET'
    };

    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            if (res.statusCode>204) {
                return reject(new Error('status='+res.statusCode));
            }

            const body = [];
            res.on('data', (chunk) => body.push(chunk));
            res.on('end', () => {
                //console.log(Buffer.concat(body).toString());

                var resBlob;
                resBlob = Buffer.concat(body).toString();
                resolve(resBlob);
            });
        })

        req.on('error', (err) => {
            reject(err);
        })

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request time out'));
        })

        req.end();
    });
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
        const allLists = await mailchimp.lists.getAllLists({ "count": 100 });
        const listId = Array.from(allLists.lists).filter(list => list.name===listName)[0].id;

        if (showDebugInfo) { console.log('list_id='+listId); }

        // Find the segment, or create an ad-hoc segment:
        // ----------------------------------------------
        if (listId) {

            // Option 1: Find a specific, named segment:
            if (segmentName) {
                const allSegments = await mailchimp.lists.listSegments(listId);
                segmentId = Array.from(allSegments.segments).filter(seg => seg.name===segmentName)[0].id;

                if (!segmentId) {
                    throw 'Could not find segment name \"'+segmentName+'\".';
                }

                segmentOpts={
                    "saved_segment_id": segmentId
                };

                if (showDebugInfo) { console.log('segment_id='+segmentOpts.saved_segment_id); }

            }

            // Option 2: Create an ad-hoc segment from a list of one or more regions:
            if (regions) {

                // Normalize region names to simplify matching:
                regions=regions.toUpperCase().replace('-', '').replace(' ', '');

                // 2a. Find the Group ID for the "Region" group:
                var groupId;
                const allGroups = await mailchimp.lists.getListInterestCategories(listId);
                groupId=Array.from(allGroups.categories).filter(group => group.title==="Region")[0].id

                var memberList=[];

                // 2b. Find all matching regions:
                var allGroupMembers=await mailchimp.lists.listInterestCategoryInterests(listId, groupId, {"count": 100});

                Array.prototype.forEach.call(allGroupMembers.interests, member => {
                    if (showDebugInfo) { console.log(member.name+'?'); }
                    // Is this member in the list of regions?
                    if (regions.split(",").includes(member.name.toUpperCase().replace('-', '').replace(' ', ''))) {
                        if (showDebugInfo) { console.log('Yup.'); }
                        memberList.push(member.id);
                    } else {
                        if (showDebugInfo) { console.log('Nope.'); }
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
            const allTemplates = await mailchimp.templates.list({ "count": 1000 });
            templateId=Array.from(allTemplates.templates).filter(template => template.name===templateName)[0].id;

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
        throw err;
    }

    return(campaignId);
}





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
              //console.log(Buffer.concat(body).toString());

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










function httpHeaders(res) {
    // The "preload" directive also enables the site to be pinned (HSTS with Preload)
    const hstsPreloadHeader = 'max-age=31536000; includeSubDomains; preload'
    res.header('Strict-Transport-Security', hstsPreloadHeader); // HTTP Strict Transport Security with preload

    // Don't apply the CSP header to image/script/css assets, and not to API calls:
    if (['png', 'jpg', 'jpeg', 'gif', 'css', 'js', 'json'].indexOf(res.req.originalUrl.split(".").reverse()[0].toLowerCase())==-1 &&
        res.req.originalUrl.toLowerCase().indexOf('/api/')==-1) {

        // Limits use of external script/css/image resources
        // Mailchimp made me add the 'unsafe-eval' and 'unsafe-inline' stuff. :(
        res.header('Content-Security-Policy', "default-src https: 'self'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-eval' 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://*.list-manage.com https://s3.amazonaws.com/downloads.mailchimp.com/;");
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