var express = require("express");
var zombie = require("zombie");
var request = require("request");
var lazy = require('lazy');

var retrieveUnemployment = function(callback) {
    // Screen scrape BLS web page for latest unemployment information
    zombie.visit("http://data.bls.gov/timeseries/LNS14000000", function(err,
            browser, status) {
        var unemploymentData = [];

        // Grab the unemployment table
        var ths = browser.querySelectorAll("table.regular-data tbody th");
        for ( var i = 0; i < ths.length; i++) {
            var unemploymentEntry = {};

            // Grab each row header and use it to set the year
            var th = ths.item(i);
            var year = th.innerHTML.trim();

            // Grab each cell in the row and use it to set the month and
            // unemployment rate
            var tds = th.parentNode.getElementsByTagName("td");
            for ( var j = 0; j < tds.length && j < 12; j++) {
                var monthData = tds.item(j).innerHTML.trim();
                if (monthData && monthData !== "&nbsp;") {
                    unemploymentEntry = {
                        month : j + 1,
                        year : parseFloat(year),
                        rate : parseFloat(monthData)
                    };
                    unemploymentData.push(unemploymentEntry);
                }
            }
        }
        console.log("Retrieved unemployment data from BLS.");
        callback(unemploymentData);
    });
}

var retrieveGDP = function(callback) {
    var url = "http://www.bea.gov//national/nipaweb/GetCSV.asp?GetWhat=SS_Data/Section1All_csv.csv&Section=2";
    request(url, function(error, response, body) {
        if (!error && response.statusCode == 200) {
            var i = 0;
            var lineNumber = 0;
            var quarterlyDataFound = false;
            var years, quarters, gdp;
            while (i < body.length) {
                var j = body.indexOf("\n", i);
                if (j == -1)
                    j = body.length;
                var line = body.substr(i, j - i);
                if (lineNumber === 39 && line.indexOf("Quarterly data") === 0) {
                    quarterlyDataFound = true;
                } else if (lineNumber === 44 && quarterlyDataFound) {
                    years = line.split(",");
                } else if (lineNumber === 45 && quarterlyDataFound) {
                    quarters = line.split(",");
                } else if (lineNumber === 46 && quarterlyDataFound
                        && line.indexOf("Gross domestic product") !== -1) {
                    gdp = line.split(",");
                }
                i = j + 1;
                lineNumber++;
            }
        }
        var gdpJson = [];
        for (var i = 3; i < gdp.length; i++) {
            gdpJson.push({
               quarter: parseInt(quarters[i].trim()),
               year: parseInt(years[i].trim()),
               gdp: parseFloat(gdp[i].trim())
            });
        }
        callback(gdpJson);
    });

}

var app = express.createServer();

app.set('view options', {
    layout : false
});

// Expose the static resources on two non-route URLs
app.use("/js", express.static(__dirname + '/js'));
app.use("/css", express.static(__dirname + '/css'));

// Route: GET /unemployment -> Unemployment JSON data
app.get("/unemployment", function(req, res) {
    retrieveUnemployment(function(unemploymentData) {
        res.json(unemploymentData);
    });
});

// Route: GET /unemployment -> Unemployment JSON data
app.get("/gdp", function(req, res) {
    retrieveGDP(function(gdpData) {
        res.send(gdpData);
    });
});

// Route: GET /dashboard -> Jade template
app.get("/dashboard", function(req, res) {
    retrieveUnemployment(function(unemploymentData) {
        res.render("index.jade", {
            blsData : JSON.stringify(unemploymentData)
        });
    });
});

// Get the environment variables we need.
var ipaddr = process.env.OPENSHIFT_INTERNAL_IP || "127.0.0.1";
var port = process.env.OPENSHIFT_INTERNAL_PORT || "3000";

// And start the app on that interface (and port).
app.listen(port, ipaddr, function() {
    console.log('%s: Node server started on %s:%d ...', Date(Date.now()),
            ipaddr, port);
    retrieveGDP(function() {
    });
});