var _ = require('lodash');

function Game(teamId, teamData) {
    teamData = teamData || {};

    this.id = teamId;
    this.players = teamData.players || [];
    this.targets = teamData.targets || [];
    this.status = teamData.status || Game.statuses.waiting;
    this.turn = teamData.turn;
    this.turnStartedTime = teamData.turnStartedTime;
}

Game.statuses = {
    waiting: 'waiting',
    running: 'running'
};

Game.prototype.clear = function(){
    this.players = [];
    this.targets = [];
};

Game.prototype.findTargetById = function(id){
    return _(this.targets).find(function(t){ return t.id == id });
};

Game.prototype.findTargetByName = function(name){
    return _(this.targets).find(function(t){ return t.name.toLowerCase() == name.toLowerCase(); });
};

Game.prototype.findPlayerById = function(id){
    return _(this.players).find(['id', id]);
};

Game.prototype.findPlayerByName = function(name){
    return _(this.players).find(function(p){ return p.name.toLowerCase() == name.toLowerCase(); });
};

Game.prototype.randomPlayer = function(exceptIds){
    exceptIds = exceptIds || [];
    return _(this.players).reject(function(p){ return _(exceptIds).includes(p.id) }).sample();
};

module.exports = Game;
