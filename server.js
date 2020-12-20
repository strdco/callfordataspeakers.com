#!/usr/bin/env node




// Core modules:
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const https = require('https');

// Other modules:
const express = require('express');
const bodyParser = require('body-parser');

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
  Default page:
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

    res.status(200).send(createHTML('index.html', {}));
});













/*-----------------------------------------------------------------------------
  Register a new URL and send a verification link:
-----------------------------------------------------------------------------*/

app.post('/create-campaign', function (req, res, next) {

    // HSTS
    if (req.secure) { res.header('Strict-Transport-Security', hstsPreloadHeader); }

    if(req.body.name==''  || req.body.email=='' ||
       req.body.regions=='' || req.body.regions.split(",").length>2 ||
       req.body.venue=='' || req.body.date==''  ||
       !req.body.url.match(validUrl)) {
            res.status(400);
    }
    else {


        sqlQuery(connectionString,

            'EXECUTE CallForDataSpeakers.Insert_Campaign @Name=@Name, @Email=@Email, @Regions=@Regions, @Venue=@Venue, @Date=@Date, @URL=@URL;',

            [   { "name": 'Name',    "type": Types.NVarChar, "value": req.body.name },
                { "name": 'Email',   "type": Types.NVarChar, "value": req.body.email },
                { "name": 'Regions', "type": Types.NVarChar, "value": req.body.regions },
                { "name": 'Venue',   "type": Types.NVarChar, "value": req.body.venue },
                { "name": 'Date',    "type": Types.Date,     "value": req.body.date },
                { "name": 'URL',     "type": Types.NVarChar, "value": req.body.url }],

                function(recordset) {
                    if (recordset) {

                        var token=recordset[0].Token;

                        (async function () {
                            console.log('Sending slack message');
                            try {
                                const slackResponse = await sendSlackMessage(req.body.webhook, payload);
                                res.status(200).json({ "message": slackResponse });
                                console.log('Message response', slackResponse);
                            } catch (e) {
                                console.log(e);
                                res.status(500).json({ "message": "There was a problem." });
                            }
                            })();

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






