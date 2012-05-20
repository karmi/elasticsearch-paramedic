function l(m) { Ember.Logger.log(m); }

var App = Em.Application.create({
  name: "Paramedic",

  ready: function() {
    App.indices.initialize();
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

  initialize: function() {
    var self = this;

    $.getJSON("http://localhost:9200/_cluster/state", function(data) {
      for (var index_name in data.routing_table.indices) {

        var index = App.Index.create({
          name: index_name,
          state: data.metadata.indices[index_name]['state'],
          settings: Ember.Object.create({
            number_of_replicas: data.metadata.indices[index_name]['settings']['index.number_of_replicas']
          }),
          // mappings: data.metadata.indices[index_name]['mappings'],
          aliases: data.metadata.indices[index_name]['aliases']
        });

        index.set("shards", function() {
          var shards = []
          for (var shard_name in data.routing_table.indices[index_name]['shards']) {

            data.routing_table.indices[index_name]['shards'][shard_name].forEach(function(shard) {
              l(shard)

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

        self.addObject(index);
      }
    });
  }
});
