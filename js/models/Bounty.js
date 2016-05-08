
function Bounty(data) {
    data = data || {};

    this.turn = data.turn;
    this.value = data.value;
    this.type = data.type;
    this.target = data.target; //id
    this.health = data.health;
}

Bounty.types = {
    attack: 'attack',
    defend: 'defend'
};

Bounty.create = function(turn, value, type, target, health) {
    var bounty = new Bounty({
        turn: turn,
        value: value,
        type: type,
        target: target,
        health: health
    });
    return bounty;
};

module.exports = Bounty;