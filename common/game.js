var cards   = require('./cards.js');

var PLAYER_ID_KEY           = 'id';
var WHITE_PP                = 10;
var INIT_RANK               = 1.0;
var INIT_NUM_WHITE_CARDS    = 10;
var ANSWER_SEPARATOR        = ' , '

var HOUSE_RULES = {
  // Rebooting the universe
  REBOOT_UNIVERSE : 0,
  // Packing head
  PACK_HEAT       : 1,
  // Rando Cardissian
  RANDO           : 2
};

var CZAR_ELECT_POLICY = {
  LAST_AWESOME  : 1000,
  RANDOM        : 1001
};


// Player
var Player = function (playerId, playerName) {
  this.id     = playerId;
  this.score  = 0;
  this.name   = playerName;
  this.czar   = false;

  this.czarPolicy = CZAR_ELECT_POLICY.LAST_AWESOME;
};

Player.prototype.getId = function () {
  return this.id;
};

Player.prototype.addPoints = function (points) {
  this.score += points;
};

Player.prototype.deductPoints = function (points) {
  this.score -= points;
};

Player.prototype.setCards = function (cards) {
  this.cards = cards;
};

Player.prototype.getCards = function () {
  return this.cards;
};

Player.prototype.setCzar = function (makeCzar) {
  this.czar = makeCzar;
};

Player.prototype.toJSON = function () {
  return {
    id    : this.id,
    name  : this.name,
    score : this.score,
    cards : this.cards,
    czar  : this.czar
  };
};

// Game
var Game = function (gameId) {
  this.id = gameId;
  this.playerList = [];

  var gameCards = cards();
  this.qPool = gameCards.black;
  this.aPool = gameCards.white;

  this.aTakenIds = [];

  this.roundMap = {};
};

Game.prototype.getId = function () {
  return this.id;
};

Game.prototype._generatePlayerId = function () {
  return (this.playerList.length + '_' + Date.now());
};

Game.prototype.addPlayer = function (playerName, isCzar) {
  var id = this._generatePlayerId();
  var player = new Player(id, playerName);
  player.setCzar(!!isCzar);
  this.playerList.push(player);

  var whiteCards = this.drawWhiteCards(INIT_NUM_WHITE_CARDS);
  player.setCards(whiteCards);

  return id;
};

Game.prototype.removePlayer = function (playerId) {
  // TODO
};

Game.prototype.getPlayers = function () {
  return this.playerList;
};

Game.prototype.getPlayer = function (playerId) {
  for (var i = 0; i < this.playerList.length; i++) {
    if (this.playerList[i].getId() === playerId) {
      return this.playerList[i];
    }
  }

  return null;
};

Game.prototype.drawBlackCard = function (num) {
  var randomIndex = this.qPool.length + 1;
  while (!this.qPool[randomIndex]) {
    randomIndex = Math.round(Math.random() * (this.qPool.length + 1));
  }

  this.blackCard = this.qPool[randomIndex];
  delete this.qPool[randomIndex];
};

Game.prototype.drawWhiteCards = function (num) {
  var whiteCards = [];
  for (var i = 0; i < num; i++) {
    var randomIndex = this.aPool.length + 1;
    while (true) {
      randomIndex = Math.round(Math.random() * (this.aPool.length + 1));
      var whiteCard = this.aPool[randomIndex];
      if (!whiteCard || this.aTakenIds.indexOf(whiteCard.id) >= 0) {
        continue;
      }
      for (var j = 0; j < whiteCards.length; j++) {
        var whiteCardB = whiteCards[j] || {};
        if (whiteCard.id === whiteCardB.id) {
          continue;
        }
      }
      break;
    }
    this.aTakenIds.push(whiteCard.id);
    whiteCards.push(whiteCard);
  }

  return whiteCards;
};

Game.prototype.changeCard = function (playerId, cardId) {
  var player = this.getPlayer(playerId);
  if (player) {
    var whiteCards = player.getCards();
    var newCards = this.drawWhiteCards(1);
    var newWhiteCards = [];
    for (var i = 0; i < whiteCards.length; i++) {
      if (whiteCards[i].id === cardId) {
        newWhiteCards.push({
          id  : newCards[0].id,
          text: newCards[0].text,
          hide: true
        });
        var index = this.aTakenIds.indexOf(cardId);
        this.aTakenIds[index] = null;
      } else {
        newWhiteCards.push(whiteCards[i]);
      }
    }

    player.setCards(newWhiteCards);

    return newWhiteCards;
  }
  return [];
};

Game.prototype.getBlackCard = function () {
  return this.blackCard;
};

Game.prototype.pickCard = function (playerId, cardId) {
  if (this.roundMap[playerId]) {
    this.roundMap[playerId].push(cardId);
  } else {
    this.roundMap[playerId] = [ cardId ];
  }

  return this.allPlayed();
};

Game.prototype.findCard = function (cardId) {
  for (var j = 0; j < this.aPool.length; j++) {
    if (this.aPool[j].id === cardId) {
      return this.aPool[j];
    }
  }

  return null;
};

Game.prototype.getAnswers = function () {
  var answers = [];
  for (var playerId in this.roundMap) {
    var cardIds = this.roundMap[playerId];
    var cards = [];
    for (var i = 0; i < cardIds.length; i++) {
      var cardId = cardIds[i];
      var card   = this.findCard(cardId);
      cards.push(card);
    }
    var text  = '';
    var texts = []
    for (var i = 0; i < cards.length; i++) {
      texts.push(cards[i].text);
    }
    answers.push({
      playerId: playerId,
      cards   : cards,
      text    : texts.join(ANSWER_SEPARATOR)
    });
  }

  return answers;
};

Game.prototype.newRound = function () {
  this.roundMap = {};
  var players = this.getPlayers();
  for (var i = 0; i < players.length; i++) {
    players[i].setCzar(false);
  }
};

Game.prototype.allPlayed = function () {
  var len = 0;
  var blackCard = this.getBlackCard();
  var pick = blackCard.pick || 1;
  for (var key in this.roundMap) {
    len++;
    if (this.roundMap[key].length < pick) {
      return false;
    }
  }

  return (len === (this.playerList.length - 1));
};

module.exports = Game;
