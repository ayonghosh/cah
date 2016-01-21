var http      = require('http');
var fs        = require('fs');
var router    = require('routes')();
var io        = require('socket.io');

var app       = require('./app.js');
var Logger    = require('./logger.js');

(function () {
  var PORT                 = 2244;
  var LOGNAME              = 'server';
  var INDEX_FILE_PATH      = __dirname + '/../client/index.html';
  var JS_FILE_PATH         = __dirname + '/../client/controller.js';

  var GAME_TITLE           = 'Cardz Against Humanity';

  var server;
  var socket;

  var port = process.env.PORT || PORT;


  function _replaceAll(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
  };

  function _getClientAddress(req) {
    return (req.headers['x-forwarded-for'] || '').split(',')[0]
      || req.connection.remoteAddress;
  };

  function _getWSClientAddress(ws) {
    if (ws && ws.upgradeReq && ws.upgradeReq.connection) {
      return ws.upgradeReq.connection.remoteAddress || '';
    }
    return '';
  };

  function _generatePageResponse(gameId) {
    var str = fs.readFileSync(INDEX_FILE_PATH).toString();
    var game = app.getGame(gameId);
    str = _replaceAll(str, '<%INIT_GAME_TEXT%>', game ? 'Join Game' :
      'Start Game');
    str = _replaceAll(str, '<%NEW_GAME%>', game ? 'false' : 'true');
    str = _replaceAll(str, '<%GAME_TITLE%>', GAME_TITLE);

    return str;
  };

  function _wsBroadcast(event, msg) {
    socket.emit(event, msg);
  };

  function _info(req) {
    return {
      src: _getClientAddress(req)
    };
  };

  function _sendResponse(res, options) {
    return function () {
      res.write(options ? options.body : '');
      res.statusCode = options && options.status ? options.status : 200;
      res.end();
    };
  };

  function _sendWsResponse(data, client) {
    if (!data) {
      return;
    }
    for (var i = 0; i < data.length; i++) {
      var cmd       = data[i][app.RESPONSE.COMMAND];
      var payload   = data[i][app.RESPONSE.DATA];
      var broadcast = data[i][app.RESPONSE.BROADCAST];

      if (typeof payload === 'object') {
        payload = JSON.stringify(payload);
      }

      if (broadcast) {
        _wsBroadcast(cmd, payload);
      } else {
        client.emit(cmd, payload);
      }
    }
  };


  // Routes:
  // index - start game
  router.addRoute('/', function (req, res, params) {
    var html = _generatePageResponse();
    _sendResponse(res, { body: html })();
    Logger.log(Logger.LOGLEVEL.INFO, req.method + ' /', LOGNAME, _info(req));
  });

  // index - existing game
  router.addRoute('/game/:gameid', function (req, res, params) {
    var gameId = params['gameid'];
    try {
      var html = _generatePageResponse(gameId);
      _sendResponse(res, { body: html })();
      Logger.log(Logger.LOGLEVEL.INFO, req.method + ' /', LOGNAME, _info(req));
    } catch (e) {

    }
  });

  // JS
  router.addRoute('/js/controller.js', function (req, res, params) {
    var jsCode = fs.readFileSync(JS_FILE_PATH).toString();
    jsCode = jsCode.replace('<%COMMANDS%>', JSON.stringify(app.COMMAND));
    jsCode = jsCode.replace('<%PORT%>', port);
    _sendResponse(res, { body:  jsCode})();
    Logger.log(Logger.LOGLEVEL.INFO, req.method + ' /controller.js',
      LOGNAME, _info(req));
  });


  // Create server
  server = http.createServer(function (req, res) {
    var match = router.match(req.url);
    if (match) {
      match.fn(req, res, match.params);
    } else {
      // TODO: throw 404 page
    }
  });

  // Start web sockets+HTTP server
  socket = io.listen(server.listen(port));
  Logger.log(Logger.LOGLEVEL.INFO, 'Started HTTP+websocket server on port ' +
             port, LOGNAME, { src: 'self' });


  // API
  socket.sockets.on('connection', function (client) {
    var clientId = null;

    client.on(app.COMMAND.START_GAME, function (playerName) {
      var response = app.onPlayerStartGame(playerName);
      _sendWsResponse(response, client);
    });

    client.on(app.COMMAND.JOIN_GAME, function (data) {
      data = JSON.parse(data);
      var response = app.onPlayerJoinGame(data);
      _sendWsResponse(response, client);
    });

    client.on(app.COMMAND.CHANGE_CARD, function (data) {
      data = JSON.parse(data);
      var response = app.onPlayerChangeCard(data);
      _sendWsResponse(response, client);
    });

    client.on(app.COMMAND.PICK_CARD, function (data) {
      data = JSON.parse(data);
      var response = app.onPlayerPickCard(data);
      _sendWsResponse(response, client);
    });

    client.on(app.COMMAND.CZAR_PICK, function (data) {
      data = JSON.parse(data);
      var response = app.onCzarPickCard(data);
      _sendWsResponse(response, client);
    });

    client.on('disconnect', function () {
      // TODO: garbage collect old games
    });
  });

})();
