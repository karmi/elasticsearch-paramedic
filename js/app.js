function l(m) { Ember.Logger.log(m); }

var App = Em.Application.create({
  name: "Paramedic",

  ready: function() {
    l(App.name + ' loaded.')
    App.indices.refresh();
    setInterval(function() { App.indices.refresh() }, 1000);
    return this._super()
  ;}
});

// ===== Models ===================================================================================

App.Node = Ember.Object.extend({
});

App.Index = Ember.Object.extend({
});

App.Index.Shard = Ember.Object.extend({
});

// ===== Controllers ==============================================================================

App.indices = Ember.ArrayController.create({
  content: [],

  contains: function(item) {
    return (Ember.typeOf(item) == 'string') ? this.mapProperty('name').contains(item) : this._super();
  },

  refresh: function() {
    var self = this;

    $.getJSON("http://localhost:9200/_cluster/state", function(data) {
      for (var index_name in data.routing_table.indices) {

        // Create or find an index
        //
        if ( !self.contains(index_name) ) self.addObject(App.Index.create({ name: index_name }))
        var index = self.findProperty("name", index_name)

        // Update index properties
        //
        index
          .set("state", data.metadata.indices[index_name]['state'])

          .set("settings", Ember.Object.create({
            number_of_replicas: data.metadata.indices[index_name]['settings']['index.number_of_replicas']
          }))

          .set("aliases", data.metadata.indices[index_name]['aliases'])

          .set("shards", function() {
            var shards = []
            for (var shard_name in data.routing_table.indices[index_name]['shards']) {

              data.routing_table.indices[index_name]['shards'][shard_name].forEach(function(shard) {
                // l(shard)
                shards.addObject(App.Index.Shard.create({
                  name: shard.shard,
                  state: shard.state,
                  primary: shard.primary,
                  node_id: shard.node,
                  relocating_node_id: shard.relocating_node
                }));
              });
            }
            return shards.sort(function(a,b) {return a.get('primary') < b.get('primary')})
          }())

        // Remove deleted indices from the collection
        // TODO: Use model instance identity for this
        //
        self.forEach(function(item) {
          // console.log(item.name)
          var loc = self.content.length || 0
          while(--loc >= 0) {
            var curObject = self.content.objectAt(loc)
            if ( !Ember.keys(data.routing_table.indices).contains(item.name) && curObject.name === item.name) {
              self.content.removeAt(loc)
            }
          }
        })
      }
    });
  }
});
