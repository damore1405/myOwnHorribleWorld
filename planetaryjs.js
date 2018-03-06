planetaryjs.plugins.topojson = function(config) {
  return function(planet) {
    planet.plugins.topojson = {};

    planet.onInit(function(done) {
      if (config.world) {
        planet.plugins.topojson.world = config.world;
        setTimeout(done, 0);
      } else {
        var file = config.file || 'world-110m.json';
        d3.json(file, function(err, world) {
          if (err) {
            throw new Error("Could not load JSON " + file);
          }
          planet.plugins.topojson.world = world;
          done();
        });
      }
    });
  };
};

planetaryjs.plugins.oceans = function(config) {
  return function(planet) {
    planet.onDraw(function() {
      planet.withSavedContext(function(context) {
        context.beginPath();
        planet.path.context(context)({type: 'Sphere'});

        context.fillStyle = config.fill || 'black';
        context.fill();
      });
    });
  };
};

planetaryjs.plugins.land = function(config) {
  return function(planet) {
    var land = null;

    planet.onInit(function() {
      var world = planet.plugins.topojson.world;
      land = topojson.feature(world, world.objects.land);
    });

    planet.onDraw(function() {
      planet.withSavedContext(function(context) {
        context.beginPath();
        planet.path.context(context)(land);

        if (config.fill !== false) {
          context.fillStyle = config.fill || 'white';
          context.fill();
        }

        if (config.stroke) {
          if (config.lineWidth) context.lineWidth = config.lineWidth;
          context.strokeStyle = config.stroke;
          context.stroke();
        }
      });
    });
  };
};

planetaryjs.plugins.borders = function(config) {
  return function(planet) {
    var borders = null;
    var borderFns = {
      internal: function(a, b) {
        return a.id !== b.id;
      },
      external: function(a, b) {
        return a.id === b.id;
      },
      both: function(a, b) {
        return true;
      }
    };

    planet.onInit(function() {
      var world = planet.plugins.topojson.world;
      var countries = world.objects.countries;
      var type = config.type || 'internal';
      borders = topojson.mesh(world, countries, borderFns[type]);
    });

    planet.onDraw(function() {
      planet.withSavedContext(function(context) {
        context.beginPath();
        planet.path.context(context)(borders);
        context.strokeStyle = config.stroke || 'gray';
        if (config.lineWidth) context.lineWidth = config.lineWidth;
        context.stroke();
      });
    });
  };
};

planetaryjs.plugins.earth = function(config) {
  config = config || {};
  var topojsonOptions = config.topojson || {};
  var oceanOptions = config.oceans || {};
  var landOptions = config.land || {};
  var bordersOptions = config.borders || {};

  return function(planet) {
    planetaryjs.plugins.topojson(topojsonOptions)(planet);
    planetaryjs.plugins.oceans(oceanOptions)(planet);
    planetaryjs.plugins.land(landOptions)(planet);
    planetaryjs.plugins.borders(bordersOptions)(planet);
  };
};

planetaryjs.plugins.pings = function(config) {
  var pings = [];
  config = config || {};

  var addPing = function(lng, lat, options) {
    options = options || {};
    options.color = options.color || config.color || 'white';
    options.angle = options.angle || config.angle || 5;
    options.ttl   = options.ttl   || config.ttl   || 2000;
    var ping = { time: new Date(), options: options };
    if (config.latitudeFirst) {
      ping.lat = lng;
      ping.lng = lat;
    } else {
      ping.lng = lng;
      ping.lat = lat;
    }
    pings.push(ping);
  };

  var drawPings = function(planet, context, now) {
    var newPings = [];
    for (var i = 0; i < pings.length; i++) {
      var ping = pings[i];
      var alive = now - ping.time;
      if (alive < ping.options.ttl) {
        newPings.push(ping);
        drawPing(planet, context, now, alive, ping);
      }
    }
    pings = newPings;
  };

  var drawPing = function(planet, context, now, alive, ping) {
    var alpha = 1 - (alive / ping.options.ttl);
    var color = d3.rgb(ping.options.color);
    color = "rgba(" + color.r + "," + color.g + "," + color.b + "," + alpha + ")";
    context.strokeStyle = color;
    var circle = d3.geo.circle().origin([ping.lng, ping.lat])
      .angle(alive / ping.options.ttl * ping.options.angle)();
    context.beginPath();
    planet.path.context(context)(circle);
    context.stroke();
  };

  return function (planet) {
    planet.plugins.pings = {
      add: addPing
    };

    planet.onDraw(function() {
      var now = new Date();
      planet.withSavedContext(function(context) {
        drawPings(planet, context, now);
      });
    });
  };
};

planetaryjs.plugins.zoom = function (options) {
  options = options || {};
  var noop = function() {};
  var onZoomStart = options.onZoomStart || noop;
  var onZoomEnd   = options.onZoomEnd   || noop;
  var onZoom      = options.onZoom      || noop;
  var afterZoom   = options.afterZoom   || noop;
  var startScale  = options.initialScale;
  var scaleExtent = options.scaleExtent || [50, 2000];

  return function(planet) {
    planet.onInit(function() {
      var zoom = d3.behavior.zoom()
        .scaleExtent(scaleExtent);

      if (startScale !== null && startScale !== undefined) {
        zoom.scale(startScale);
      } else {
        zoom.scale(planet.projection.scale());
      }

      zoom
        .on('zoomstart', onZoomStart.bind(planet))
        .on('zoomend', onZoomEnd.bind(planet))
        .on('zoom', function() {
          onZoom.call(planet);
          planet.projection.scale(d3.event.scale);
          afterZoom.call(planet);
        });
      d3.select(planet.canvas).call(zoom);
    });
  };
};

planetaryjs.plugins.drag = function(options) {
  options = options || {};
  var noop = function() {};
  var onDragStart = options.onDragStart || noop;
  var onDragEnd   = options.onDragEnd   || noop;
  var onDrag      = options.onDrag      || noop;
  var afterDrag   = options.afterDrag   || noop;

  return function(planet) {
    planet.onInit(function() {
      var drag = d3.behavior.drag()
        .on('dragstart', onDragStart.bind(planet))
        .on('dragend', onDragEnd.bind(planet))
        .on('drag', function() {
          onDrag.call(planet);
          var dx = d3.event.dx;
          var dy = d3.event.dy;
          var rotation = planet.projection.rotate();
          var radius = planet.projection.scale();
          var scale = d3.scale.linear()
            .domain([-1 * radius, radius])
            .range([-90, 90]);
          var degX = scale(dx);
          var degY = scale(dy);
          rotation[0] += degX;
          rotation[1] -= degY;
          if (rotation[1] > 90)   rotation[1] = 90;
          if (rotation[1] < -90)  rotation[1] = -90;
          if (rotation[0] >= 180) rotation[0] -= 360;
          planet.projection.rotate(rotation);
          afterDrag.call(planet);
        });
      d3.select(planet.canvas).call(drag);
    });
  };
};
<!-- <html>
<head>
  <script type='text/javascript' src='http://d3js.org/d3.v3.min.js'></script>
  <script type='text/javascript' src='http://d3js.org/topojson.v1.min.js'></script>
  <script type='text/javascript' src='./planetaryjs.js'></script>
</head>
<body>
    <canvas id='rotatingGlobe' 'cursor: move;'></canvas>
</body>
<script>
var thing = function() {
  var globe = planetaryjs.planet();
  // Load our custom `autorotate` plugin; see below.
  globe.loadPlugin(autorotate(10));
  // The `earth` plugin draws the oceans and the land; it's actually
  // a combination of several separate built-in plugins.
  //
  // Note that we're loading a special TopoJSON file
  // (world-110m-withlakes.json) so we can render lakes.
  globe.loadPlugin(planetaryjs.plugins.earth({
    topojson: { file:   '/world-110m-withlakes.json' },
    oceans:   { fill:   '#bdbdbd' },
    land:     { fill:   '#2c3d7f' },
    borders:  { stroke: '#2c3d7f' }
  }));
  // Load our custom `lakes` plugin to draw lakes; see below.
  globe.loadPlugin(lakes({
    fill: '#bdbdbd'
  }));
  // The `pings` plugin draws animated pings on the globe.
  globe.loadPlugin(planetaryjs.plugins.pings());
  // The `zoom` and `drag` plugins enable
  // manipulating the globe with the mouse.
  globe.loadPlugin(planetaryjs.plugins.zoom({
    scaleExtent: [100, 300]
  }));
  globe.loadPlugin(planetaryjs.plugins.drag({
    // Dragging the globe should pause the
    // automatic rotation until we release the mouse.
    onDragStart: function() {
      this.plugins.autorotate.pause();
    },
    onDragEnd: function() {
      this.plugins.autorotate.resume();
    }
  }));
  // Set up the globe's initial scale, offset, and rotation.
  globe.projection.scale(175).translate([175, 175]).rotate([0, -10, 0]);

  // Every few hundred milliseconds, we'll draw another random ping.
  var colors = ['red', 'yellow', 'white', 'orange', 'green', 'cyan', 'pink'];
  setInterval(function() {
    var lat = Math.random() * 170 - 85;
    var lng = Math.random() * 360 - 180;
    var color = colors[Math.floor(Math.random() * colors.length)];
    globe.plugins.pings.add(lng, lat, { color: color, ttl: 9000, angle: Math.random() * 10 });
  }, 150);

  var canvas = document.getElementById('rotatingGlobe');
  // Special code to handle high-density displays (e.g. retina, some phones)
  // In the future, Planetary.js will handle this by itself (or via a plugin).
  if (window.devicePixelRatio == 2) {
    canvas.width = 800;
    canvas.height = 800;
    context = canvas.getContext('2d');
    context.scale(2, 2);
  }
  // Draw that globe!
  globe.draw(canvas);

  // This plugin will automatically rotate the globe around its vertical
  // axis a configured number of degrees every second.
  function autorotate(degPerSec) {
    // Planetary.js plugins are functions that take a `planet` instance
    // as an argument...
    return function(planet) {
      var lastTick = null;
      var paused = false;
      planet.plugins.autorotate = {
        pause:  function() { paused = true;  },
        resume: function() { paused = false; }
      };
      // ...and configure hooks into certain pieces of its lifecycle.
      planet.onDraw(function() {
        if (paused || !lastTick) {
          lastTick = new Date();
        } else {
          var now = new Date();
          var delta = now - lastTick;
          // This plugin uses the built-in projection (provided by D3)
          // to rotate the globe each time we draw it.
          var rotation = planet.projection.rotate();
          rotation[0] += degPerSec * delta / 1000;
          if (rotation[0] >= 180) rotation[0] -= 360;
          planet.projection.rotate(rotation);
          lastTick = now;
        }
      });
    };
  };

  // This plugin takes lake data from the special
  // TopoJSON we're loading and draws them on the map.
  function lakes(options) {
    options = options || {};
    var lakes = null;

    return function(planet) {
      planet.onInit(function() {
        // We can access the data loaded from the TopoJSON plugin
        // on its namespace on `planet.plugins`. We're loading a custom
        // TopoJSON file with an object called "ne_110m_lakes".
        var world = planet.plugins.topojson.world;
        lakes = topojson.feature(world, world.objects.ne_110m_lakes);
      });

      planet.onDraw(function() {
        planet.withSavedContext(function(context) {
          context.beginPath();
          planet.path.context(context)(lakes);
          context.fillStyle = options.fill || 'black';
          context.fill();
        });
      });
    };
  };
};

thing();
</script>
 -->