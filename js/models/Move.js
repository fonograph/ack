var _ = require('lodash');

function Move(data) {
    data = data || {};

    this.type = data.type;
    this.target = data.target; //target id or player id
    this.value = data.value;
    this.time = data.time || Date.now();
    this.player = data.player; //id
    this.originalCommand = data.originalCommand; //unprocessed string for reporting

    switch ( this.type ) {
        case Move.names.expose:
            this.cost = 2;
            break;
        default:
            this.cost = 1;
            break;
    }
}

Move.names = {
    attack: 'hack',
    attack2: 'hsync',
    attack2X: 'hsync+',
    //attackNoDef: 'tunnel',
    //attackNoDefX: 'tunnel+',
    defend: 'wall',
    defend2: 'ssync',
    //defend2X: 'ssync+',
    //defend3: 'smax',
    //defend3X: 'ssync+',
    transferSecret: 'transfer-secret',
    transferCreds: 'transfer-credits',
    expose: 'expose'
};

Move.combos = [
    Move.names.attack2,
    Move.names.attack2X,
    Move.names.defend2
];

Move.fromText = function(text, player, game) {
    var Player = require('./Player');
    var parts = text;

    var originalCommand = parts.join(' ');

    var type = parts[0];
    switch ( type ) {
        case Move.names.attack:
        case Move.names.attack2:
        case Move.names.attack2X:
        case Move.names.defend:
        case Move.names.defend2:
            if ( parts.length < 2 ) {
                throw "You need to specify a target."; // TODO: give format
            }
            var target = game.findTargetByName(parts[1]);
            if ( !target ) {
                throw "Invalid target.";
            }
            if ( _(Move.combos).includes(type) && !_(player.moves).filter({type:type, target:target.id}).isEmpty() ) {
                throw "You cannot do this twice in one turn.";
            }
            return new Move({
                type: type,
                target: target.id,
                player: player.id,
                originalCommand: originalCommand
            });
        case Move.names.transferSecret:
        case Move.names.transferCreds:
            if ( parts.length < 3 ) {
                throw "You need to specify what to transfer and to whom."; //TODO: give format
            }
            var targetPlayer = game.findPlayerByName(parts[1]);
            if ( !targetPlayer ) {
                throw "Invalid player.";
            }
            var value = parts[2];
            if ( type == Move.names.transferCreds ) {
                if ( !parseInt(value) ) {
                    throw "Invalid number of credits."
                }
                if ( player.score < value ) {
                    throw "You don't have enough credits.";
                }
                else if ( Player.availableCredits(player) < value ) {
                    throw "Your existing moves this turn don't leave enough remaining credits for that.";
                }
            }
            if ( type == Move.names.transferSecret ) {
                var secretPlayer = game.findPlayerByName(value);
                if ( !secretPlayer || !_(player.secrets).includes(secretPlayer.id) ) {
                    throw "You don't have a secret for that player.";
                }
                else if ( !_(Player.availableSecrets(player)).includes(secretPlayer.id) ) {
                    throw "A previous move this turn is already using that secret.";
                }
                value = secretPlayer.id;
            }
            return new Move({
                type: type,
                target: targetPlayer.id,
                value: value,
                player: player.id,
                originalCommand: originalCommand
            });
        case Move.names.expose:
            if ( parts.length < 2 ) {
                throw "You need to specify what secret to expose.";
            }
            var secretPlayer = game.findPlayerByName(parts[1]);
            if ( !secretPlayer || !_(player.secrets).includes(secretPlayer.id) ) {
                throw "You don't have a secret for that player.";
            }
            else if ( !_(Player.availableSecrets(player)).includes(secretPlayer.id) ) {
                throw "A previous move this turn is already using that secret.";
            }
            return new Move({
                type: type,
                target: secretPlayer.id,
                player: player.id,
                originalCommand: originalCommand
            });
    }
};

module.exports = Move;