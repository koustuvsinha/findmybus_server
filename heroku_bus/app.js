var restify = require('restify');
var mongojs = require('mongojs');
var http = require('https');
var busroutes = require('save')('routes');
var logger = require('save')('logger');

var connection_string = 'mongodb://koustuv:sinha@ds029969.mongolab.com:29969/bus_routes';
var db = mongojs(connection_string, ['bus_routes']);
var route = db.collection("routes");

//var ip_addr = process.env.IP || '127.0.0.1';
var port = process.env.PORT || 5000;

var busPos = 0;
var googleKey = "AIzaSyAlDul9dFo9TR1BUGXC8sUCSCDN_o8OCBE";

var server = restify.createServer({
	name : "buslocator"
});

server.use(restify.queryParser());
server.use(restify.fullResponse());
server.use(restify.bodyParser());
server.use(restify.CORS());

//app routes
var PATH = '/routes';
var SHOWPATH = '/routes/show';
var BUSPATH = '/location/bus';
var LOGPATH = '/log';
var BUSLOG = '/location/all';

var toggle = 1;

//demo function to emulate bus traversal
setInterval(function() {
    if(toggle == 1) {
        if(busPos == 21) {
            toggle = 2;
        }
        else{
            busPos ++;
        }
    }
    if(toggle == 2) {
        if(busPos == 0) {
            toggle = 1;
        }
        else {
            busPos --;
        }

    }
    console.log('Bus at pos %s',busPos);
},10000);

//get nearest bus-stop for client location
server.get(PATH, function(req,res,next) {
   
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.params.route == undefined) {
		return next(new restify.InvalidArgumentError('Route must be supplied'));
	}else if((req.params.lat == undefined)||(req.params.lon == undefined)) {
		return next(new restify.InvalidArgumentError('Latitude/Longitude must be supplied'));
	}
	else {
        if(req.params.route == 'v1') {
        var st = 0;
	    busroutes.find({},function (error,routes) {
 	    if(routes.length == 0) {
            console.log("Empty Array");
            st = 1;
        }
	    });
            if(st == 1) {
                route.find({bus_name: "v1"}).sort({route_id : 1},function (error,data) {
                    console.log("Local data saving...");
                    busroutes.create(data, getCoords);              //save to localdb
                });
            }
            else{
                console.log("Local Data available");
                busroutes.find({},function(err,data) {
                    getCoords(err,data[0]);
                });
            }
        }

	}
    function getCoords(err,success) {
        if(success) {
     console.log(success);
	 var coords = [];
	 var geoCoords = [];
	 var index = 0;
	 var mapString;	
            for(var key in success) {

                if(success.hasOwnProperty(key)) {
                if(key != '_id') {
                console.log(key);
                coords.push(success[key].lat + "," + success[key].lon);
                var Coords = {};
                Coords.lat = success[key].lat;
                Coords.lon = success[key].lon;
                Coords.index = success[key].route_id;
                geoCoords.push(Coords);

                if(index == 0) mapString = coords[0];
                else mapString = mapString + "|" + coords[index];

                index++;
                }
                }

            }

            var mapPath = "/maps/api/distancematrix/json?origins=" + req.params.lat + "," + req.params.lon + "&destinations=" + mapString + "&sensor=false&key="+googleKey;

            console.log("maps.googleapis.com"+mapPath);
	    var options = {
                host : "maps.googleapis.com",
                path : mapPath,
                method : 'GET'
            };
        http.request(options, function(rest) {
                
		var data = '';
        //console.log('STATUS: ' + rest.statusCode);
        //console.log('HEADERS: ' + JSON.stringify(rest.headers));
        rest.on('data', function (chunk) {
            //console.log('BODY: ' + chunk);
            data += chunk;
		});
		rest.on('end', function () {
		    console.log("Data recieved");
                    var mapData = JSON.parse(data);
		    console.log("Data parsed");
                    console.log(data);
		    
		    var mindist = 0;
                    var minCoords = 0;
                    for(index = 0; index < coords.length; index ++) {
                        var dist = mapData.rows[0].elements[index].distance.value;
                        if(index == 0) { mindist = dist; minCoords = 0; }
                        else {
                            if(dist < mindist) { mindist = dist; minCoords = index; }
                        }
                    }
		    console.log(mindist);
		    console.log(minCoords);
	    	    geoCoords[minCoords].distance = mindist;		    
                    res.send(200,geoCoords[minCoords]);
                    return next();

                });
            }).end();

        }
        if(err) {
            return next(err);
        }
    }

});

//display all bus_stops for a route

server.get(SHOWPATH, function(req,res,next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.params.route == undefined) {
        return next(new restify.InvalidArgumentError('Route must be supplied'));
    }else{
        if(req.params.route == 'v1') {
	    var st = 0;
	    busroutes.find({"bus_name": "v1"},function (error, routes) {
		if(routes.length <= 0) { 
			console.log("Empty array!");
			st = 1;	
		}
		
	   });
	    if(st == 1) {
            route.find({"bus_name": "v1"}).sort({route_id : 1},function (error,data) {
		console.log("Local data saving...");
		busroutes.create(data, showCoords);                 //save data to localdb
		busroutes.find({},function(err1,routes) {
		console.log(routes);
		});
	    });
	    }
	    else{
		console.log("Local Data available");
		busroutes.find({"bus_name": "v1"},function(err,success) {
            showCoords(err,success[0]);
        });
	    }
        }
    }
    function showCoords(err,success) {
        if(success) {
	    var mapData = {};
	    mapData.elements = success; 		
            res.send(200,mapData);
            res.next();
        }
        if(err) {
            res.next(err);
        }
    }

});

//display current bus location

server.get(BUSPATH, function(req,res,next) {
    res.setHeader('Access-Control-Allow-Origin','*');
    if(req.params.route == undefined) {
        return next(new restify.InvalidArgumentError('Route must be supplied'));
    }else{
        if(req.params.route == 'v1') {
            var st = 0;
            busroutes.find({},function (error, routes) {
                if(routes.length <= 0) {
                    console.log("Empty array!");
                    st = 1;
                }

            });
            if(st == 1) {
                route.find({bus_name: "v1"}).sort({route_id : 1},function (error,data) {
                    console.log("Local data saving...");
                    busroutes.create(data, getLocation);                //save data to localdb
                    busroutes.find({},function(err1,routes) {
                        console.log(routes);
                    });
                });
            }
            else{
                console.log("Local Data available");
                busroutes.find({},function(err,success) {
                    getLocation(err,success[0]);
                });
            }
        }
    }
    function getLocation(err,success) {
        var geoCoords = [];
        if(success) {
            for(var key in success) {
                if(key!='_id') {
                var Coords = {};
                Coords.lat = success[key].lat;
                Coords.lon = success[key].lon;
                Coords.index = success[key].route_id;
                geoCoords.push(Coords);
            }
            }
            res.send(200,geoCoords[busPos]);
            res.next();
        }
        if(err) {
            res.next(err);
        }

    }
});


server.get(LOGPATH,function(req,res,next) {
   //url format : route,bus,lat,lon,time,sp,desc
   if(req.params.route == undefined || req.params.bus == undefined || req.params.lat == undefined || req.params.lon == undefined || req.params.time == undefined || req.params.sp == undefined || req.params.desc == undefined) {
       return next(new restify.InvalidArgumentError("API call error : route, bus, lat,lon,time,sp,desc"));
   }else{
       logger.create({route: req.params.route, bus: req.params.bus, lat: req.params.lat,lon: req.params.lon, time: req.params.time, sp: req.params.sp, desc: req.params.desc}, function (error, log) {
           if (error) return next(new restify.InvalidArgumentError(JSON.stringify(error.errors)))

           res.send(200, "OK");
           res.next();
       });

   }

});

server.get(BUSLOG,function(req,res,next) {
   //url format : /location/all?route
    if(req.params.route == undefined) {
        return next(new restify.InvalidArgumentError("API call error : route required"));
    }
    else{
       logger.find({"route" : req.params.route},function(err,logs) {
          if(logs) {
             if(logs.length <= 0) {
              res.send(200,"Logger Empty!");
                 res.next();
                } else {
              res.send(200,logs);
              res.next();
                }
          }
          if(err) {
           res.next(err);
           }
       });
    }
});

server.listen(port,function(){
	console.log('%s listening at %s',server.name,server.url);
});
