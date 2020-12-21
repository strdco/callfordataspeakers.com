#!/usr/bin/env node




// Core modules:
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const https = require('https');

// Other modules:
const express = require('express');
const bodyParser = require('body-parser');

const mailchimp = require("@mailchimp/mailchimp_marketing");

// The web server itself:
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
  
// Mailchimp configuration
mailchimp.setConfig({
    apiKey: process.env.mcapikey,
    server: process.env.mcapikey.split("-")[1],
});



/*
async function pingMailchimp() {
    const response = await mailchimp.ping.get();
    console.log('Mailchimp API status: '+response.health_status);
}

pingMailchimp();
*/










// The "preload" directive also enables the site to be pinned (HSTS with Preload)
const hstsPreloadHeader = 'max-age=31536000; includeSubDomains; preload'

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
               appName       : 'callfordataspeakers.com' // host name of the web server
        } 
    };






/*-----------------------------------------------------------------------------
  Start the web server
-----------------------------------------------------------------------------*/
var serverPort=process.argv[2] || process.env.PORT || 3000;
console.log('\n\n\n\n\nStarting on port '+serverPort+'!')
app.listen(serverPort, () => console.log('Listening.\n'));








/*-----------------------------------------------------------------------------
  Default page: Speaker registration
-----------------------------------------------------------------------------*/

app.get('/', function (req, res, next) {

    // HSTS
    if (req.secure) { res.header('Strict-Transport-Security', hstsPreloadHeader); }

    var options = {
        root: __dirname + '/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    res.status(200).send(createHTML('speaker.html', {}));
});






/*-----------------------------------------------------------------------------
  Default page: Event request
-----------------------------------------------------------------------------*/

app.get('/event', function (req, res, next) {

    // HSTS
    if (req.secure) { res.header('Strict-Transport-Security', hstsPreloadHeader); }

    var options = {
        root: __dirname + '/',
        dotfiles: 'deny',
        headers: {
            'x-timestamp': Date.now(),
            'x-sent': true
        }
    };

    res.status(200).send(createHTML('event.html', {}));
});








/*-----------------------------------------------------------------------------
  Register a new event request, send a request email to moderator:
-----------------------------------------------------------------------------*/

app.post('/request', function (req, res, next) {

    // HSTS
    if (req.secure) { res.header('Strict-Transport-Security', hstsPreloadHeader); }

    var formName=req.body.FNAME+' '+req.body.LNAME;
    var formEmail=req.body.EMAIL;
    var formEventName=req.body.EVENT;
    var formEventVenue=req.body.VENUE;
    var formEventDate;
    try {
        formEventDate=new Date(
            req.body["EVENTDATE[year]"]+'-'+
            req.body["EVENTDATE[month]"]+'-'+
            req.body["EVENTDATE[day]"]+' 00:00:00+00:00').toISOString();
    } catch(err) {
        res.status(400);
        return;
    }
    var formEventURL=req.body.URL;
    var formEventRegions=req.body.REGION;




    if(!formName  || !formEmail || !formEventName ||
       !formEventVenue || !formEventDate  ||
       formEventRegions.split(",").length>2 ||
       !formEventURL.match(validUrl)) {

            console.log("Pretty clever, huh.");
            res.status(400);
            return;
    }
    else {




        sqlQuery(connectionString,

            'EXECUTE CallForDataSpeakers.Insert_Campaign @Name=@Name, @Email=@Email, @EventName=@EventName, @Regions=@Regions, @Venue=@Venue, @Date=@Date, @URL=@URL;',

            [   { "name": 'Name',    "type": Types.NVarChar, "value": formName },
                { "name": 'Email',   "type": Types.NVarChar, "value": formEmail },
                { "name": 'EventName', "type": Types.NVarChar, "value": formEventName },
                { "name": 'Regions', "type": Types.NVarChar, "value": formEventRegions },
                { "name": 'Venue',   "type": Types.NVarChar, "value": formEventVenue },
                { "name": 'Date',    "type": Types.Date,     "value": formEventDate },
                { "name": 'URL',     "type": Types.NVarChar, "value": formEventURL }],

                function(recordset) {
                    if (recordset) {

                        // Create an email to all moderators, requesting event approval:
                        var approveButton='<a class="mcnButton" title="Approve" href="https://callfordataspeakers.com/approve/'+recordset[0].Token+'" '+
                                                'target="_blank" style="font-weight:normal;letter-spacing:normal;line-height:100%;text-align:center;'+
                                                'text-decoration:none;color:#000000;">Approve</a>';

                        var templateSections={
                            "name": formName,
                            "event_email": formEmail,
                            "event_regions": formEventRegions,
                            "event_name": formEventName,
                            "event_venue": formEventVenue,
                            "event_date": formEventDate,
                            "event_url": formEventURL,
                            "event_approve": approveButton
                        };

                        sendCampaign('Organizers', 'Moderators', 'New campaign request', false, false, templateSections);

                        res.status(200).send(
                            'jQuery19007968987507031464_1608589753492('+
                            JSON.stringify({
                                "result": "success",  //error
                                "msg": "Thank you. A moderator will review your request."
                            })+')'
                        );
                        
                    } else {
                        console.log('ERROR: Couldn\'t create the campain record in the database.');
                        res.status(500);
                        return;
                    }
                });
            }
        });







/*-----------------------------------------------------------------------------
  Other related assets, like client-side JS, CSS, whatever:
-----------------------------------------------------------------------------*/

app.get('/assets/:asset', function (req, res, next) {

    // HSTS
    if (req.secure) { res.header('Strict-Transport-Security', hstsPreloadHeader); }

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




// Puts a string inside apostrophes and escapes apostrophes in the string:
function sqlEncode(s) {
    if (s!=null) {
        return('\''+s.toString().split('\'').join('\'\'')+'\'');
    } else {
        return('NULL');
    }
}







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

async function sendCampaign (listName, segmentName, templateName, enableTracking, tweet, templateSections) {

    var organizerListId;
    var segmentId;
    var templateId;
    var campaignId;

    try {
        // Find the "Organizers" list (audience):
        var allLists = await mailchimp.lists.getAllLists();

        Array.prototype.forEach.call(allLists.lists, list => {
            if (list.name==listName) {
                organizerListId=list.id;
                listNo=allLists.total_items;
            }
        });

        if (organizerListId) {
            // Find the "Moderators" segment:
            var allSegments = await mailchimp.lists.listSegments(organizerListId);

            Array.prototype.forEach.call(allSegments.segments, segment => {
                if (segment.name==segmentName) {
                    segmentId=segment.id;
                }
            });
        }

        if (segmentId) {
            // Find the template:
            var allTemplates = await mailchimp.templates.list();

            Array.prototype.forEach.call(allTemplates.templates, template => {
                if (template.name==templateName) {
                    templateId=template.id;
                }
            });
        }

        if (templateId) {
            // Create the campaign:
            var campaignParameters = {
                "type": "regular",
                "recipients": {
                    "list_id": organizerListId,
                    "segment_opts": {
                        "saved_segment_id": segmentId
                    }
                },
                "settings": {
                    "subject_line": "New campaign request",
                    "preview_text": "Preview text goes here",
                    "title": "Title goes here",
                    "from_name": "Call for Data Speakers",
                    "reply_to": "hello@callfordataspeakers.com",
                    //"to_name": "",
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
                "content_type": "template"
                /* TODO:
                ,
                "social_card": {
                    ...
                } */
            };
            var campaign = await mailchimp.campaigns.create(campaignParameters);
            campaignId = campaign.id;

            console.log(campaign);
        }

        if (campaignId) {

            if (templateSections) {
                // Set template field values for the campaign:
                var updateInstructions={
                    "template": {
                        "id": templateId,
                        "sections": templateSections
                    }
                };
                await mailchimp.campaigns.setContent(campaignId, updateInstructions);
            }

            // Send the campaign:
            await mailchimp.campaigns.send(campaignId);
            console.log('Campaign sent.');
        }
    } catch (err) {
        console.log(err);
        alert('There was a problem.');
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






