var Logger  = require('./logger.js');
var Game    = require('../common/game.js');

module.exports = (function (config) {
  var LOGNAME = 'app';

  var COMMAND = {
    START_GAME    : 'sg',
    GAME_INIT     : 'gi',
    GET_CARDS     : 'gc',
    PICK_CARD     : 'pc',
    DRAW_CARD     : 'dc',
    GET_PLAYERS   : 'gp',
    JOIN_GAME     : 'jg',
    JOIN_ACK      : 'ja',
    DRAW_BLACK    : 'db',
    DRAW_WHITE    : 'dw',
    CHANGE_CARD   : 'cc',
    WAIT_CZAR     : 'wz',
    PROMPT_CZAR   : 'pz',
    CZAR_PICK     : 'zp',
    AWESOME_POINT : 'ap',
    NEW_ROUND     : 'nr'
  }

  var RESPONSE = {
    COMMAND   : 'command',
    DATA      : 'data',
    BROADCAST : 'broadcast'
  }

  var ERROR = {
    NO_GAME: 0
  };

  var AWESOME_POINT = 1;

  var games = [];

  function _guid() {
    // RFC4122: The version 4 UUID is meant for generating UUIDs from truly-random or
    // pseudo-random numbers.
    // The algorithm is as follows:
    //     Set the two most significant bits (bits 6 and 7) of the
    //        clock_seq_hi_and_reserved to zero and one, respectively.
    //     Set the four most significant bits (bits 12 through 15) of the
    //        time_hi_and_version field to the 4-bit version number from
    //        Section 4.1.3. Version4
    //     Set all the other bits to randomly (or pseudo-randomly) chosen
    //     values.
    // UUID                   = time-low "-" time-mid "-"time-high-and-version "-"clock-seq-reserved and low(2hexOctet)"-" node
    // time-low               = 4hexOctet
    // time-mid               = 2hexOctet
    // time-high-and-version  = 2hexOctet
    // clock-seq-and-reserved = hexOctet:
    // clock-seq-low          = hexOctet
    // node                   = 6hexOctet
    // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    // y could be 1000, 1001, 1010, 1011 since most significant two bits needs to be 10
    // y values are 8, 9, A, B
    var guidHolder = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
    var hex = '0123456789abcdef';
    var r = 0;
    var guidResponse = '';
    for (var i = 0; i < 36; i++) {
      if (guidHolder[i] !== '-' && guidHolder[i] !== '4') {
        // each x and y needs to be random
        r = Math.random() * 16 | 0;
      }

      if (guidHolder[i] === 'x') {
        guidResponse += hex[r];
      } else if (guidHolder[i] === 'y') {
        // clock-seq-and-reserved first hex is filtered and remaining hex values are random
        r &= 0x3; // bit and with 0011 to set pos 2 to zero ?0??
        r |= 0x8; // set pos 3 to 1 as 1???
        guidResponse += hex[r];
      } else {
        guidResponse += guidHolder[i];
      }
    }

    return guidResponse;
  };

  // Create a new game
  function createGame() {
    var game = new Game(_guid());
    games.push(game);
    game.drawBlackCard();

    return game;
  };

  // Get existing game
  function getGame(gameId) {
    for (var i = 0; i < games.length; i++) {
      if (games[i].getId() === gameId) {
        return games[i];
      }
    }

    return null;
  };

  // Generate a response tuple
  function getResponseTuple(cmd, data, broadcast) {
    var response = {};
    response[RESPONSE.COMMAND]   = cmd;
    response[RESPONSE.DATA]      = data;
    response[RESPONSE.BROADCAST] = !!broadcast;

    return response;
  };

  // New player joins a game
  function onPlayerJoinGame(data) {
    var gameId      = data.gameId;
    var playerName  = data.playerName;
    var game = getGame(gameId);
    if (game) {
      var playerId = game.addPlayer(playerName);
      var player = game.getPlayer(playerId);
      var whiteCards = player.getCards();

      return [
        getResponseTuple(COMMAND.JOIN_ACK,    playerId),
        getResponseTuple(COMMAND.DRAW_BLACK, {
          gameId    : game.getId(),
          blackCard : game.getBlackCard()
        }),
        getResponseTuple(COMMAND.DRAW_WHITE,  whiteCards),
        getResponseTuple(COMMAND.GET_PLAYERS, {
          gameId: game.getId(),
          players: game.getPlayers()
        }, true)
      ];
    }
  };

  // Player changes a card
  function onPlayerChangeCard(data) {
    var game = getGame(data.gameId);
    if (game) {
      var whiteCards = game.changeCard(data.playerId, data.cardId);
      return [
        getResponseTuple(COMMAND.DRAW_WHITE, whiteCards)
      ];
    }
  };

  // Player picks a card
  function onPlayerPickCard(data) {
    var game = getGame(data.gameId);
    if (game) {
      var allPlayed = game.pickCard(data.playerId, data.cardId);
      if (!allPlayed) {
        return [
          getResponseTuple(COMMAND.WAIT_CZAR)
        ];
      } else {
        var cardMap = game.getAnswers();
        return [
          getResponseTuple(COMMAND.PROMPT_CZAR, cardMap, true)
        ];
      }
    }
  };

  // Player starts a game
  function onPlayerStartGame(playerName) {
    var game = createGame();
    Logger.log(Logger.LOGLEVEL.INFO, 'Created game with ID: ' +
      game.getId(), LOGNAME, { src: 'self' });

    var playerId = game.addPlayer(playerName, true);

    var players = [];
    var playerList = game.getPlayers();
    for (var i = 0; i < playerList.length; i++) {
      players.push(playerList[i].toJSON());
    }

    var player = game.getPlayer(playerId);
    var whiteCards = player.getCards();

    return [
      getResponseTuple(COMMAND.GAME_INIT,   game.getId()),
      getResponseTuple(COMMAND.JOIN_ACK,    playerId),
      getResponseTuple(COMMAND.DRAW_BLACK,  {
        gameId    : game.getId(),
        blackCard : game.getBlackCard()
      }),
      getResponseTuple(COMMAND.DRAW_WHITE,  whiteCards),
      getResponseTuple(COMMAND.GET_PLAYERS, {
        gameId  : game.getId(),
        players : game.getPlayers()
      }, true)
    ];
  };

  function onCzarPickCard(data) {
    var game      = getGame(data.gameId);
    var player    = game.getPlayer(data.awesomePlayerId);
    player.addPoints(AWESOME_POINT);
    game.newRound();
    game.drawBlackCard();
    // Make new Czar
    player.setCzar(true);

    return [
      getResponseTuple(COMMAND.AWESOME_POINT, {
        gameId  : game.getId(),
        playerId: player.getId()
      }, true),
      getResponseTuple(COMMAND.DRAW_BLACK, {
        gameId    : game.getId(),
        blackCard : game.getBlackCard()
      }, true),
      getResponseTuple(COMMAND.GET_PLAYERS, {
        gameId  : game.getId(),
        players : game.getPlayers()
      }, true),
      getResponseTuple(COMMAND.NEW_ROUND, {
        gameId        : game.getId(),
      }, true)
    ];
  }


  // Public members and functions
  return {
    // Constants
    COMMAND             : COMMAND,
    RESPONSE            : RESPONSE,
    // Functions
    createGame          : createGame,
    getGame             : getGame,
    onPlayerJoinGame    : onPlayerJoinGame,
    onPlayerStartGame   : onPlayerStartGame,
    onPlayerChangeCard  : onPlayerChangeCard,
    onPlayerPickCard    : onPlayerPickCard,
    onCzarPickCard      : onCzarPickCard
  }
})();
