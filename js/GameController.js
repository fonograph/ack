var Game = require('./models/Game');
var Move = require('./models/Move');
var Player = require('./models/Player');
var Bounty = require('./models/Bounty');
var Target = require('./models/Target');
var _ = require('lodash');
var Config = require('./config.json');
var sprintf = require('sprintf-js').sprintf;


function GameController(/*Game*/ game, commandBot, gameBot, channelId, storage) {
    this.game = game;
    this.gameBot = gameBot;
    this.commandBot = commandBot;
    this.channelId = channelId;
    this.storage = storage;
}

GameController.loadOrCreate = function(storage, commandBot, gameBot, teamId, channelId, callback) {
    storage.teams.get(teamId, function(err, teamData){
        var game = new Game(teamId, teamData);
        var controller = new GameController(game, commandBot, gameBot, channelId, storage);
        callback(controller);
    });
};

GameController.startTickers = function(storage, gameBot, channelId) {
    setInterval(function(){
        storage.teams.all(function(err, teamDatas){
            teamDatas.forEach(function(teamData){
                var game = new Game(teamData.id, teamData);
                var controller = new GameController(game, null, gameBot, channelId, storage);
                controller.handleTimePassage();
            });
        });
    }, 1000*10);
};

GameController.prototype.handlePlayerAction = function(playerId, text, message) {
    try {
        if ( text == 'join' ) {
            this.gameBot.api.users.info({user: playerId}, function (err, response) {
                var name = response.user.name;
                this.gameBot.api.im.open({user: playerId}, function (err, response) {
                    var imChannel = response.channel.id;
                    this._addPlayer(playerId, name, imChannel, message);
                    this._saveGame();
                }.bind(this))
            }.bind(this));
        }
        else if ( text == 'start' ) {
            this._startGame();
            this._saveGame();
        }
        else if ( text == 'killit' ) {
            this._endGame();
            this._saveGame();
        }
        else if ( text == 'forceit' ) {
            this._endTurn();
            this._saveGame();
        }
        else if ( text == 'reset' ) {
            this._resetQueuedMoves(playerId, message);
            this._saveGame();
        }
        else if ( text == 'help' ) {
            this._help(playerId, message);
        }
        else if ( text == 'secrets' ) {
            this._reportSecrets(playerId, message);
        }
        else if ( text == 'bounties' ) {
            this._reportBounties(playerId, message);
        }
        else if ( text == 'moves' ) {
            this._reportMoves(playerId, message);
        }
        else if ( text == 'status' ) {
            //TODO repeat global status publicly
        }
        else if ( _(Move.names).includes(text[0]) ) {
            this._queueMove(playerId, text, message);
            this._saveGame();
        }
        else {
            this.commandBot.replyPrivate(message, 'That command was not recognized.');
        }
    }
    catch (e) {
        console.error(e, e.stack);
    }
};

GameController.prototype.handleTimePassage = function() {
    if ( this.game.status != Game.statuses.running ) {
        return;
    }

    var endTime = new Date();
    endTime.setTime(this.game.turnStartedTime+Config.turnLength*60*1000);

    if ( Date.now() >= endTime ) {
        this._endTurn();
        this._saveGame();
    }
};

GameController.prototype._startGame = function() {
    if ( this.game.status != Game.statuses.waiting ) {
        this.commandBot.replyPrivate(message, 'The game is already running!');
        return;
    }

    this.game.turn = 0;
    this.game.status = Game.statuses.running;

    // create targets
    var targetCount = this.game.players.length * Config.targets.countPerPlayer;
    for ( var i=0; i<targetCount; i++ ) {
        var target = Target.create(i.toString(), Config.targets.names[i]);
        this.game.targets.push(target);
    }

    // assign bounties
    this.game.players.forEach(function(player){
        for ( var i=0; i<Config.turns; i++ ) {
            var value = Config.bounties.values[i];
            var type = Bounty.types.attack;
            var target = _(this.game.targets).sample().id;
            var health = Config.bounties.healths[i];
            var bounty = Bounty.create(i, value, type, target, health);
            player.bounties.push(bounty);
        }
    }.bind(this));

    // assign jobs
    for ( var i = 0; i < Config.turns; i++ ) {
        var targets = _.shuffle(this.game.targets);
        this.game.players.forEach(function(player) {
            var target = targets.pop();
            player.jobs.push(target.id);
        }.bind(this));
    }

    // assign value schedules
    //_.shuffle(this.game.targets).forEach(function(target,i){
    //    target.pointValueSchedule = i;
    //});
    //_.shuffle(this.game.targets).forEach(function(target,i){
    //    target.secretValueSchedule = i;
    //});

    // announce
    var msg = "The game has begun!";
    this.gameBot.say({channel:this.channelId, text:msg});

    // Tell people about their bounties
    this.game.players.forEach(function(player){
        var msg = sprintf("YOUR BOUNTIES ARE AS FOLLOWS \n");
        player.bounties.forEach(function(/*Bounty*/ bounty){
            var target = this.game.findTargetById(bounty.target);
            if ( bounty.type == Bounty.types.attack ) {
                msg += sprintf("- Reduce %s to %s health. DEADLINE: End of turn %s. REWARD: %s credits.\n", target.name, bounty.health, bounty.turn, bounty.value);
            }
        }.bind(this));
        this.gameBot.say({channel:player.imChannel, text:msg});
    }.bind(this));


    this._startTurn();
};


GameController.prototype._endGame = function() {
    this.game.status = Game.statuses.waiting;
    this.game.clear();
};


GameController.prototype._startTurn = function() {
    this.game.turnStartedTime = Date.now();

    // clear moves
    this.game.players.forEach(function(player){
        player.moves = [];
    });

    // update targets
    this.game.targets.forEach(function(target){
        var pointValueWeight = Math.random();
        var secretValueWeight = 1 - pointValueWeight;
        target.currentPointValue = (Config.targets.pointValueMax-Config.targets.pointValueMin) * pointValueWeight + Config.targets.pointValueMin;
        target.currentSecretValue = (Config.targets.secretValueMax-Config.targets.secretValueMin) * secretValueWeight + Config.targets.secretValueMin;
    });

    // announce
    var endTime = new Date();
    endTime.setTime(this.game.turnStartedTime+Config.turnLength*60*1000);
    var msg = sprintf("Turn %s has started. This turn will end at %s.", this.game.turn, endTime.toTimeString());
    this.gameBot.say({channel:this.channelId, text:msg});

    // target info
    var msg = '';
    this.game.targets.forEach(function(target){
        var assigned = _(this.game.players).find(function(p){return p.jobs[this.game.turn] == target.id}.bind(this));
        msg += sprintf("%s || Health: %s || Assigned to: %s || Credits/hack: %s || Secret/hack: %s%% \n", target.name, target.health, assigned ? assigned.name : '(none)', target.currentPointValue, target.currentSecretValue*100);
    }.bind(this));
    this.gameBot.say({channel:this.channelId, text:msg});
};

GameController.prototype._endTurn = function(){
    // execute moves
    var moves = [];
    this.game.players.forEach(function(player){
        moves = moves.concat(player.moves);
    });
    moves = _.sortBy(moves, 'time');

    var targetStates = {}; //keys: damage, heal, and the ID of each combo attack
    var targetReports = {};
    var playerReports = {};
    var extraReports = [];

    this.game.targets.forEach(function(target){
        targetStates[target.id] = {
            damage: 0,
            heal: 0
        };
        targetReports[target.id] = [];
    });
    this.game.players.forEach(function(player){
        playerReports[player.id] = [];
    });

    moves.forEach(function(move){
         this._executeMove(move.player, move, targetStates, targetReports, playerReports, extraReports);
    }.bind(this));

    //resolve failed attacks
    _(targetStates).forEach(function(state, targetId){
        var target = this.game.findTargetById(targetId);

        if ( state.attack2 == 1 ) {
            _(moves).filter({type: Move.names.attack2, target: targetId}).forEach(function(move){
                playerReports[move.player].push(sprintf("Your %s on %s failed.", move.type, target.name));
            }.bind(this));
        }
        if ( state.attack2X == 1 ) {
            _(moves).filter({type: Move.names.attack2X, target: targetId}).forEach(function(move){
                var player = this.game.findPlayerById(move.player);
                player.score -= Config.moves.attack2X.penalty;

                playerReports[move.player].push(sprintf("Your %s on %s failed, and you lost %s credits.", move.type, target.name, Config.moves.attack2X.penalty));
            }.bind(this));
        }
        if ( state.defend2 == 1 ) {
            _(moves).filter({type: Move.names.defend2, target: targetId}).forEach(function(move){
                playerReports[move.player].push(sprintf("Your %s on %s failed.", move.type, target.name));
            }.bind(this));
        }
    }.bind(this));

    // resolve damage
    _(targetStates).forEach(function(state, targetId){
        var target = this.game.findTargetById(targetId);
        var damage = Math.max(0, state.damage - state.heal);
        target.health -= damage;
        if ( target.health < 0 ) {
            target.health = 0;
        }
    }.bind(this));

    // resolve bounties & jobs
    this.game.players.forEach(function(player){
        var bounty = _(player.bounties).find(['turn', this.game.turn]);
        var bountyTarget = this.game.findTargetById(bounty.target);
        if ( bountyTarget.health <= bounty.health ) {
            player.score += bounty.value;
            playerReports[player.id].push(sprintf("You achieved your bounty this turn, and received %s credits.", bounty.value));
        }
        else {
            playerReports[player.id].push("You failed to achieve your bounty this turn.");
        }

        var jobTarget = this.game.findTargetById(player.jobs[this.game.turn]);
        var jobDamage = targetStates[jobTarget.id].damage - targetStates[jobTarget.id].heal;
        if ( jobDamage > Config.jobs.threshold ) {
            player.score -= Config.jobs.penalty;
            playerReports[player.id].push(sprintf("Your assigned job, %s, took %s damage this turn. You failed at your job and lost %s credits.", jobTarget.name, jobDamage, Config.jobs.penalty));
        }
    }.bind(this));

    // prevent <0 score
    this.game.players.forEach(function(player){
        if ( player.score < 0 ) player.score = 0;
    });

    // output reports

    _(targetReports).forEach(function(report, targetId){
        var target = this.game.findTargetById(targetId);
        var msg = sprintf("ACTIVITY ON %s: \n", target.name) + report.join("\n") + "\n";
        this.gameBot.say({channel:this.channelId, text:msg});
    }.bind(this));

    _(playerReports).forEach(function(report, playerId){
        var player = this.game.findPlayerById(playerId);
        var msg = "RESULTS FOR ENDED TURN: \n" + report.join("\n") + "\n";
        this.gameBot.say({channel:player.imChannel, text:msg});
    }.bind(this));

    if ( extraReports.length > 0 ) {
        var extraMsg = "ADDITIONAL ACTIVITY: \n" + extraReports.join("\n") + "\n";
        this.gameBot.say({channel:this.channelId, text:extraMsg});
    }

    // output ranking
    var rankingMsg = "CURRENT RANKINGS: \n";
    _(this.game.players).sortBy('score').reverse().forEach(function(player){
        rankingMsg += sprintf("%s: %s \n", player.name, player.score);
    });
    this.gameBot.say({channel:this.channelId, text:rankingMsg});

    // start new turn or end game
    this.game.turn++;
    if ( this.game.turn < Config.turns ) {
        this._startTurn();
    }
    else {
        var endingMsg = "GAME COMPLETE";
        this.gameBot.say({channel:this.channelId, text:endingMsg});
        this._endGame();
    }
};

GameController.prototype._addPlayer = function(playerId, name, imChannel, message) {
    if ( this.game.status != Game.statuses.waiting ) {
        this.commandBot.replyPrivate(message, "You can't join a running game!");
        return;
    }
    if ( this.game.findPlayerById(playerId) ) {
        this.commandBot.replyPrivate(message, "You've already joined!");
        return;
    }

    var player = Player.create(playerId, name, imChannel);
    this.game.players.push(player);

    this.commandBot.replyPrivate(message, "You've joined!");

    var msg = name + " joined the game. (Current players: " + _.map(this.game.players, 'name').join(', ') + ')';
    this.gameBot.say({channel:this.channelId, text:msg});
};

GameController.prototype._queueMove = function(playerId, text, message) {
    var player = this.game.findPlayerById(playerId);
    var movesRemaining = Config.movesPerTurn - _(player.moves).sumBy('cost');
    try {
        var move = Move.fromText(text, player, this.game);
        if ( move.cost > movesRemaining ) {
            throw "You don't have enough remaining moves in this turn.";
        }
        player.moves.push(move);
        this.commandBot.replyPrivate(message, 'Move queued. It will take effect at the end of the turn.');
    }
    catch (e) {
        this.commandBot.replyPrivate(message, e);
    }
};

GameController.prototype._resetQueuedMoves = function(playerId, message) {
    var player = this.game.findPlayerById(playerId);
    player.moves = [];
    this.commandBot.replyPrivate(message, 'Your moves have been reset.');
};

GameController.prototype._executeMove = function(playerId, /*Move*/ move, targetStates, targetReports, playerReports, extraReports) {
    var player = this.game.findPlayerById(playerId);
    switch ( move.type ) {
        case Move.names.attack:
            var target = this.game.findTargetById(move.target);
            var damage = Math.min(Config.moves.attack.damage, target.health);

            targetStates[target.id].damage += damage;

            var points = target.currentPointValue;
            player.score += points;

            var secretPlayer = Math.random() < target.currentSecretValue ? this.game.randomPlayer(player.secrets.concat(playerId)) : null;
            if ( secretPlayer ) {
                player.secrets.push(secretPlayer.id);
            }

            targetReports[target.id].push(sprintf("Someone performed a %s on %s. (-%s)", move.type, target.name, damage));
            playerReports[player.id].push(sprintf("You got %s credits by %sing %s.", points, move.type, target.name));
            if ( secretPlayer ) {
                playerReports[player.id].push(sprintf("You got a secret for %s by %sing %s.", secretPlayer.name, move.type, target.name));
            }
            else {
                playerReports[player.id].push(sprintf("You did not get a secret from %s.", target.name));
            }
            break;
        case Move.names.attack2:
            var target = this.game.findTargetById(move.target);

            if ( !targetStates[target.id].attack2 ) {
                targetStates[target.id].attack2 = 1;
                targetReports[target.id].push(sprintf("Someone initiated an %s on %s.", move.type, target.name));
            }
            else if ( targetStates[target.id].attack2 == 1 ) {
                var damage = Math.min(Config.moves.attack2.damage, target.health);
                targetStates[target.id].damage += damage;
                targetStates[target.id].attack2++;
                targetReports[target.id].push(sprintf("Someone joined an %s on %s. (-%s)", move.type, target.name, damage));
            }
            else {
                targetStates[target.id].attack2++;
                targetReports[target.id].push(sprintf("Someone joined an %s on %s.", move.type, target.name));
            }
            break;
        case Move.names.attack2X:
            var target = this.game.findTargetById(move.target);

            if ( !targetStates[target.id].attack2X ) {
                targetStates[target.id].attack2X = 1;
                targetReports[target.id].push(sprintf("Someone initiated an %s on %s.", move.type, target.name));
            }
            else if ( targetStates[target.id].attack2X == 1 ) {
                var damage = Math.min(Config.moves.attack2X.damage, target.health);
                targetStates[target.id].damage += damage;
                targetStates[target.id].attack2X++;
                targetReports[target.id].push(sprintf("Someone joined an %s on %s. (-%s)", move.type, target.name, damage));
            }
            else {
                targetStates[target.id].attack2X++;
                targetReports[target.id].push(sprintf("Someone joined an %s on %s.", move.type, target.name));
            }
            break;
        case Move.names.defend:
            var target = this.game.findTargetById(move.target);
            var heal = Config.moves.defend.damage;

            targetStates[target.id].heal += heal;

            targetReports[target.id].push(sprintf("Someone performed a %s on %s. (+%s)", move.type, target.name, heal));
            break;
        case Move.names.defend2:
            var target = this.game.findTargetById(move.target);

            if ( !targetStates[target.id].defend2 ) {
                targetStates[target.id].defend2 = 1;
                targetReports[target.id].push(sprintf("Someone initiated an %s on %s.", move.type, target.name));
            }
            else if ( targetStates[target.id].defend2 == 1 ) {
                var heal = Config.moves.defend2.damage;
                targetStates[target.id].heal += heal;
                targetStates[target.id].defend2++;
                targetReports[target.id].push(sprintf("Someone joined an %s on %s. (+%s)", move.type, target.name, heal));
            }
            else {
                targetStates[target.id].defend2++;
                targetReports[target.id].push(sprintf("Someone joined an %s on %s.", move.type, target.name));
            }
            break;
        case Move.names.transferCreds:
            var targetPlayer = this.game.findPlayerById(move.target);
            var value = move.value;
            player.score -= value;
            targetPlayer.score += value;

            playerReports[player.id].push(sprintf("You transfered %s credits to %s.", value, targetPlayer.name));
            playerReports[targetPlayer.id].push(sprintf("You received %s credits from %s.", value, player.name));
            break;
        case Move.names.transferSecret:
            var targetPlayer = this.game.findPlayerById(move.target);
            var secretPlayer = this.game.findPlayerById(move.value);
            player.secrets = _.without(player.secrets, secretPlayer.id);
            targetPlayer.secrets.push(secretPlayer.id);

            playerReports[player.id].push(sprintf("You transfered a secret about %s to %s.", secretPlayer.name, targetPlayer.name));
            playerReports[targetPlayer.id].push(sprintf("You received a secret about %s from %s.", secretPlayer.name, player.name));
            break;
        case Move.names.expose:
            var targetPlayer = this.game.findPlayerById(move.target);
            var damage = targetPlayer.score * Config.moves.expose.damage;
            targetPlayer.score -= damage;
            player.secrets = _.without(player.secrets, targetPlayer.id);

            playerReports[targetPlayer.id].push(sprintf("One of your secret was exposed! You lost %s credits.", damage));
            extraReports.push(sprintf("Someone exposed a secret of %s!", targetPlayer.name));
            break;
    }
};

GameController.prototype._reportSecrets = function(playerId, message) {
    var player = this.game.findPlayerById(playerId);

    var msg;
    if ( player.secrets.length ) {
        msg = "You have secrets for: " + player.secrets.map(function(id){ return this.game.findPlayerById(id).name; }.bind(this)).join(', ');
    }
    else {
        msg = "You have no secrets.";
    }

    this.commandBot.replyPrivate(message, msg);
};

GameController.prototype._reportMoves = function(playerId, message) {
    var player = this.game.findPlayerById(playerId);

    var msg;
    if ( player.moves.length) {
        msg = _.map(player.moves, 'originalCommand').join("\n") + "\n";

        var remaining = Config.movesPerTurn - _(player.moves).sumBy('cost');
        msg += "You have " + remaining + " moves remaining.";
    }
    else {
        msg = "You have not made any moves this turn.";
    }

    this.commandBot.replyPrivate(message, msg);
};

GameController.prototype._reportBounties = function(playerId, message) {
    var player = this.game.findPlayerById(playerId);
    var msg = "";
    player.bounties.forEach(function(/*Bounty*/ bounty){
        var target = this.game.findTargetById(bounty.target);
        if ( bounty.type == Bounty.types.attack ) {
            msg += sprintf("- Reduce %s to %s health. DEADLINE: End of turn %s. REWARD: %s credits.\n", target.name, bounty.health, bounty.turn, bounty.value);
        }
    }.bind(this));
    this.commandBot.replyPrivate(message, msg);
};

GameController.prototype._help = function(playerId, message) {
    var msg = "";
    _(Config.moves).forEach(function(info, key){
        msg += info.help + "\n";
    });
    msg += "/ack moves : Display your queued moves for the current turn. These will execute automatically at the end of the turn. \n";
    msg += "/ack reset : Clear your queued moves for the current turn, allowing you enter new ones. \n";
    msg += "/ack secrets : List the secrets you've collected. \n";
    msg += "/ack bounties : List your bounties. \n";
    this.commandBot.replyPrivate(message, msg);
};

GameController.prototype._saveGame = function() {
    this.storage.teams.save(this.game);
};



module.exports = GameController;