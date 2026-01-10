
/*

    const cannedSql=require('./canned-sql.js');

    cannedSql.sqlQuery(connectionString, statement, parameters[], function(recordset) => {
        //
        }, true/false/undefined);


*/

    const Connection = require('tedious').Connection;
    const Request = require('tedious').Request;  
    const Types = require('tedious').TYPES;

    var printDebugInfo=false;


    /*-----------------------------------------------------------------------------
    Canned SQL interface:
    -----------------------------------------------------------------------------*/
    const sqlQuery = (connectionString, statement, parameters, next, keyValueEncoding) => {

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
                next({ "error": err });
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
            if (keyValueEncoding) {
                // returns row = [{ "name": "col1", "value": "val1" }, { "name": "col2", "value": "val2" }]
                var values = [];
                rowColumns.forEach(function(column) {
                    values.push({
                        "name": column.metadata.colName,
                        "value": column.value
                    });
                });
                rows.push(values);
            } else {
                // return row = { "col1": "val1", "col2": "val2" }
                var values = {};
                rowColumns.forEach(function(column) {
                    values[column.metadata.colName] = column.value;
                });
                rows.push(values);
            }
        }

        function statementComplete(err, rowCount) {
            if (err) {
                console.log('Statement failed: ' + err);
                errMsg=err;
                next({ "error": err });
            } else {
                if (printDebugInfo) { console.log('Statement succeeded: ' + rowCount + ' rows'); }
            }
        }

        function requestDone(rowCount, more) {
            console.log('Request done: ' + rowCount + ' rows');
        }

        function requestCompleted() {
            if (printDebugInfo) { console.log('Request completed'); }
            conn.close();
            if (!errMsg) {
                next({ "data": rows });
            }
        }
        
        function connectionEnd() {
            if (printDebugInfo) { console.log('Connection closed'); }
        }

        function connectionError(info) {
            // 5701 "changed database context to .."
            // 5703 "changed language setting to .."
            // 8153 "Null value is eliminated by an aggregate .."
            if ([5701, 5703, 8153].indexOf(info.number)==-1 || printDebugInfo) {
                console.log('Msg '+info.number + ': ' + info.message);
            }
        }

        function connectionGeneralError(err) {
            console.log('General database error:');
            console.log(err);
        }

    }

    function parameterType(datatype) {
        switch (datatype) {
            case 'bigint':
            case 'int':
            case 'smallint':
            case 'tinyint':
                return Types.BigInt;
  
            case 'float':
            case 'real':
            case 'decimal':
            case 'numeric':
            case 'decimal':
                return Types.Decimal;
  
            case 'bit':
                return Types.Bit;
  
            case 'date':
            case 'smalldate':
            case 'datetime':
            case 'smalldatetime':
            case 'datetime2':
                return Types.DateTime2;
            
            case 'time':
                return Types.Time;
  
            default:
                return Types.NVarChar;
        }
    }
  


    exports.printDebugInfo=printDebugInfo;
    exports.sqlQuery=sqlQuery;
    exports.parameterType=parameterType;
    exports.Types=Types;
