var _ = require('lodash');
var Config = require('../config.json');

function Player(data) {
    this.id = '';
    this.name = '';
    this.imChannel = '';
    this.score = 0;
    this.moves = [];
    this.bounties = [];
    this.jobs = []; // just target IDs for now
    this.secrets = []; // player IDs
}

Player.create = function(id, name, imChannel) {
    var player = new Player();
    player.id = id;
    player.name = name;
    player.imChannel = imChannel;
    player.score = Config.startingPoints;

    return player;
};

Player.availableCredits = function(player) {
    var Move = require('./Move');

    var s = player.score;
    player.moves.forEach(function(move){
        if ( move.type == Move.names.transferCreds ) {
            s -= move.value;
        }
    });
    return s;
};

Player.availableSecrets = function(player) {
    var Move = require('./Move');

    var s = player.secrets;
    player.moves.forEach(function(move){
        if ( move.type == Move.names.transferSecret ) {
            s = _.without(s, move.value);
        }
        else if ( move.type == Move.names.expose ) {
            s = _.without(s, move.target);
        }
    });
    return s;
};

module.exports = Player;