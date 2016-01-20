(function () {

  var PLAYER_TYPE = {
    NORMAL: 0,
    CZAR  : 1
  };

  var CMD = <%COMMANDS%>;
  var MAX_CHANGED_CARDS = 10;

  var ws = null;
  var host = window.location.hostname;
  var port = window.location.port;

  // Game state
  var gameId            = null;
  var playerId          = null;
  var cards             = [];
  var answers           = [];
  var currentCardIndex  = null;
  var currentPickIndex  = null;
  var isCzar            = false;
  var isAnswerView      = false;
  var changedCards      = 0;
  var pick              = 1;
  var pickCount         = 0;

  function main() {
    if ('WebSocket' in window) {
      ws = io.connect('ws://' + host + ':' + port);

      var path      = window.location.pathname;
      var isNewGame = document.getElementById('new-game').value;
      if (isNewGame !== 'true' && path && path.indexOf('/game/') === 0) {
        gameId = path.split('/')[2];
      }
    }

    var startBtn = document.getElementById('start-btn');
    startBtn.onclick = startGame;

    var nextCard = document.getElementById('next');
    nextCard.onclick = showNextCard;

    var prevCard = document.getElementById('prev');
    prevCard.onclick = showPrevCard;

    var drawCard = document.getElementById('draw');
    drawCard.onclick = changeCard;

    var pickCardEl = document.getElementById('pick');
    pickCardEl.onclick = pickCard;

    // Game initialized
    ws.on(CMD.GAME_INIT, function (id) {
      history.pushState({}, 'Cards Against Humanity', '/game/' + id);
      gameId = id;
      renderPlayerView();
    });

    // Cards received
    ws.on(CMD.GET_CARDS, function (data) {
      cards = JSON.parse(data);
      currentCardIndex = 0;
      showCard();
    });

    // List of players refreshed
    ws.on(CMD.GET_PLAYERS, function (data) {
      data = JSON.parse(data || '[]');
      if (data.gameId === gameId) {
        renderPlayers(data.players);
      }
    });

    // Join ACK, playerID assigned
    ws.on(CMD.JOIN_ACK, function (newPlayerId) {
      playerId = newPlayerId;
    });

    // Show black card
    ws.on(CMD.DRAW_BLACK, function (data) {
      data = JSON.parse(data || '{}');
      if (data.gameId === gameId) {
        drawBlackCard(data.blackCard);
      }
    });

    // Get white cards
    ws.on(CMD.DRAW_WHITE, function (data) {
      data = JSON.parse(data || '[]');
      drawWhiteCards(data);
    });

    // Prompt Czar to pick favourite card
    ws.on(CMD.PROMPT_CZAR, function (data) {
      data = JSON.parse(data || '[]');
      renderAnswerView(data);
    });

    // New round started
    ws.on(CMD.NEW_ROUND, function (data) {
      data = JSON.parse(data || '{}');
      if (data.gameId === gameId) {
        renderPlayerView();
        resetCards();
      }
    })
  };

  function toPayload(params) {
    if (gameId !== null) {
      params.gameId   = gameId;
    }
    if (playerId !== null) {
      params.playerId = playerId;
    }

    return JSON.stringify(params);
  };

  function drawBlackCard(card) {
    pick      = card.pick || 1;
    pickCount = 0;

    var qTextEl = document.getElementById('q-text');
    qTextEl.innerHTML = formatCardText(card.text || '');
  };

  function drawWhiteCards(whiteCards) {
    cards = whiteCards;
    currentCardIndex = currentCardIndex || 0;
    showCard();
  };

  function _replaceAll(str, find, replace) {
    return str.replace(new RegExp(find, 'g'), replace);
  };

  function formatCardText(text) {
    text = _replaceAll(text, '\\(R\\)',   '<sup>®</sup>');
    text = _replaceAll(text, '\\(TM\\)',  '<sup>™</sup>');

    return text;
  };

  function showCard() {
    var card;
    var cardClass = '';
    if (isAnswerView) {
       card = answers[currentCardIndex];
       cardClass = 'answer';
    } else {
       card = cards[currentCardIndex];
    }
    var cardTextEl = document.querySelector('#a-pane .a-text');
    var cardText = card ? card.text : '';
    cardTextEl.innerHTML = '<div class="' + cardClass + '">' +
      formatCardText(cardText) + '</div>';
  }

  function showNextCard() {
    if (isAnswerView) {
      currentCardIndex = (currentCardIndex + 1) % answers.length;
    } else {
      currentCardIndex = (currentCardIndex + 1) % cards.length;
    }

    if (!isAnswerView) {
      if (cards[currentCardIndex].hide) {
        showNextCard();
      } else {
        showCard();
      }
    } else {
      showCard();
    }
  };

  function showPrevCard() {
    if (currentCardIndex === 0) {
      if (isAnswerView) {
        currentCardIndex = answers.length - 1;
      } else {
        currentCardIndex = cards.length - 1;
      }
    } else {
      currentCardIndex--;
    }

    if (!isAnswerView) {
      if (cards[currentCardIndex].hide) {
        showPrevCard();
      } else {
        showCard();
      }
    } else {
      showCard();
    }
  };

  function renderPlayers(players) {
    var markup = '';
    for (var i = 0; i < players.length; i++) {
      if (players[i].id === playerId) {
        if (players[i].czar) {
          isCzar = true;
        } else {
          isCzar = false;
        }
      }
      var pNameClass = 'p-name' +
        ((players[i].id === playerId) ? ' p-me' : '');
      markup +=
        '<div class="player">' +
          '<div class="' + pNameClass + '">' + players[i].name + '</div>' +
          '<div class="p-points">' + players[i].score + '</div>' +
          ((players[i].czar) ? '<div class="p-czar">♕</div>' : '') +
        '</div>';
    }
    var playerPane = document.getElementById('p-pane');
    // Replay animation
    var className = playerPane.className;
    playerPane.className = '';
    setTimeout(function () {
      playerPane.className = className;
    }, 10);

    playerPane.innerHTML = markup;

    if (isCzar) {
      renderPlayerView();
    }
  };

  function toggleView(viewId, show, visibility) {
    if (visibility) {
      document.getElementById(viewId).style.visibility =
        show ? 'visible' : 'hidden';
    } else {
      document.getElementById(viewId).style.display =
        show ? 'block' : 'none';
    }
  };

  function renderPlayerView() {
    currentCardIndex = 0;
    isAnswerView = false;
    changedCards = 0;

    document.getElementById('a-pane').className = '';

    if (isCzar) {
      toggleView('a-pane', false);
      toggleView('p-ctrl', false);
      toggleView('overlay', true);
    } else {
      toggleView('a-pane', true);
      toggleView('p-ctrl', true);
      toggleView('overlay', false);
      showCard();
    }
    toggleView('pick', true, true);
    toggleView('draw', true, true);
  };

  function resetCards() {
    for (var i = 0; i < cards.length; i++) {
      cards[i].hide = false;
    }
  };

  function renderAnswerView(answerCards) {
    answers = answerCards;
    currentCardIndex = 0;
    isAnswerView = true;

    document.getElementById('a-pane').className = 'curved-edge';

    toggleView('a-pane', true);
    toggleView('p-ctrl', true);
    if (!isCzar) {
      toggleView('pick', false, true);
    }
    toggleView('draw', false, true);
    toggleView('overlay', false);

    showCard();
  };

  function renderWaitView() {
    toggleView('a-pane', false);
    toggleView('p-ctrl', false);
    toggleView('overlay', true);
    toggleView('draw', false, true);
  };

  function changeCard(event) {
    // Allow changing up to 10 cards
    if (event) {
      changedCards++;
      if (changedCards === MAX_CHANGED_CARDS) {
        toggleView('draw', false, true);
      }
    }
    var card = cards[currentCardIndex];
    ws.emit(CMD.CHANGE_CARD, toPayload({ cardId: card.id }));
  }

  function pickCard() {
    var card;
    if (isAnswerView && isCzar) {
      card = answers[currentCardIndex];
      ws.emit(CMD.CZAR_PICK, toPayload({ awesomePlayerId: card.playerId }));
    } else {
      pickCount++;

      card = cards[currentCardIndex];
      changeCard();
      ws.emit(CMD.PICK_CARD, toPayload({ cardId: card.id }));

      if (pickCount === pick) {
        renderWaitView();
      }
    }
  };

  function startGame() {
    var mainView = document.getElementById('main-view');
    mainView.className = 'main-ctr play';
    var playerNameInputEl = document.getElementById('p-name-input');
    var playerName = playerNameInputEl.value.length ? playerNameInputEl.value :
      ('Poop' + Date.now() % 10 + 'r');
    if (gameId) {
      ws.emit(CMD.JOIN_GAME, toPayload({ playerName: playerName }));
    } else {
      ws.emit(CMD.START_GAME, playerName);
    }
  };

  main();
})();
