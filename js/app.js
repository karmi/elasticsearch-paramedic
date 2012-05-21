function l(m) { Ember.Logger.log(m); }

var App = Em.Application.create({
  name: "Paramedic",

  ready: function() {
    l(App.name + ' loaded.')
    App.indices.__perform_refresh();
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
    clearTimeout(App.indices.poller)

    App.indices.poller = setTimeout(
      function() { App.indices.__perform_refresh() },
      1000
    )
  },

  __perform_refresh: function() {
    var self = this;

    var __load_cluster_state = function(data) {
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
    };

    var __load_indices_stats = function(data) {
      for (var index_name in data._all.indices) {
        var index = self.findProperty("name", index_name)
        if (!index) return

        index
          .set("size", data._all.indices[index_name]['primaries']['store']['size'])
          .set("size_in_bytes", data._all.indices[index_name]['primaries']['store']['size_in_bytes'])
          .set("docs", data._all.indices[index_name]['primaries']['docs']['count'])
          .set("indexing", data._all.indices[index_name]['primaries']['indexing'])
          .set("search", data._all.indices[index_name]['primaries']['search'])
          .set("get", data._all.indices[index_name]['primaries']['get'])
      }
    };

    var __load_indices_status = function(data) {
      for (var index_name in data.indices) {
        var index = self.findProperty("name", index_name)
        if (!index) continue

        for (var shard_name in data.indices[index_name]['shards']) {
          var shard = index.shards.findProperty("name", shard_name)
          if (!shard) continue

          data.indices[index_name]['shards'][shard_name].forEach(function(shard_data) {
            // l(shard_data)
            shard
              .set("size", shard_data.index.size)
              .set("docs", shard_data.docs.num_docs)
            shard
              .set("recovery", function() {
                var recovery_type = shard_data['gateway_recovery'] ? 'gateway_recovery' : 'peer_recovery'

                return {
                  stage:    shard_data[recovery_type].stage,
                  time:     shard_data[recovery_type].time,
                  progress: shard_data[recovery_type].index.progress,
                  size:     shard_data[recovery_type].index.size,
                  reused_size: shard_data[recovery_type].index.reused_size
                }
              }())
          });
        }
      }
    };

    $.getJSON("http://localhost:9200/_cluster/state",        __load_cluster_state);
    $.getJSON("http://localhost:9200/_stats",                __load_indices_stats);
    $.getJSON("http://localhost:9200/_status?recovery=true", __load_indices_status);

    // Schedule next run
    //
    // App.indices.refresh();
  }
});
