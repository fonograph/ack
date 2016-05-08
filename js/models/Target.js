
function Target(data){
    data = data || {};

    this.id = data.id;
    this.name = data.name;
    this.health = data.health;

    this.currentPointValue =  data.currentPointValue;
    this.currentSecretValue = data.currentSecretValue;
}

Target.create = function(id, name){
    var target = new Target({
        id: id,
        name: name,
        health: 100
    });
    return target;
};

module.exports = Target;