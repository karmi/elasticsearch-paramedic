function l(m) { Ember.Logger.log(m); }

var App = Em.Application.create({
  name: "Paramedic",

  ready: function() {
    l(App.name + ' (re)loaded.')
    App.cluster.__perform_refresh()
    App.nodes.__perform_refresh()
    App.indices.__perform_refresh()
    App.Cubism.setup();
    return this._super()
  },

  elasticsearch_url: function() {
    var location = window.location
    return (/_plugin/.test(location.href.toString())) ? location.protocol + "//" + location.host : "http://localhost:9200"
  }(),

  refresh_intervals : Ember.ArrayController.create({
    content: [
      {label: '1 sec',  value: 1000},
      {label: '5 sec',  value: 5000},
      {label: '15 sec', value: 15*1000},
      {label: '1 min',  value: 60*1000},
      {label: '5 min',  value: 5*60*1000},
      {label: '15 min', value: 15*60*1000}
    ]
  }),

  refresh_allowed: true
});

App.refresh_interval = App.refresh_intervals.toArray()[1]

// ===== Models ===================================================================================

App.Cluster = Ember.Object.extend({
});

App.Node = Ember.Object.extend({
});

App.Index = Ember.Object.extend({
  url: function() {
    return App.elasticsearch_url + '/' + this.name + '/_search?pretty'
  }.property("name").cacheable(),

  closed: function() {
    return (this.state && this.state == 'close')
  }.property("state").cacheable()
});

App.Index.Shard = Ember.Object.extend({
});

// ===== Controllers ==============================================================================

App.cluster = Ember.Object.create({
  content: App.Cluster.create({}),

  refresh: function() {
    clearTimeout(App.cluster.poller)
    setTimeout(function() { App.set("refreshing", false) }, 1000)
    App.cluster.poller = setTimeout( function() { App.cluster.__perform_refresh() }, App.refresh_interval.value )
  },

  __perform_refresh: function() {
    if (!App.refresh_allowed) { return }
    var self = this;

    var __load_cluster_info = function(data) {
      App.cluster.setProperties(data)
      App.cluster.refresh();
    }

    App.set("refreshing", true)
    $.getJSON(App.elasticsearch_url+"/_cluster/health", __load_cluster_info);
  }
});

App.nodes = Ember.ArrayController.create({
  content: [],

  contains: function(item) {
    return (Ember.typeOf(item) == 'string') ? this.mapProperty('id').contains(item) : this._super();
  },

  refresh: function() {
    clearTimeout(App.nodes.poller)
    setTimeout(function() { App.set("refreshing", false) }, 1000)
    App.nodes.poller = setTimeout( function() { App.nodes.__perform_refresh() }, App.refresh_interval.value )
  },

  __perform_refresh: function() {
    if (!App.refresh_allowed) { return }
    var self = this;

    var __load_nodes_info = function(data) {
      for (var node_id in data.nodes) {
        if ( !self.contains(node_id) ) self.addObject(App.Node.create({ id: node_id }))
        var node = self.findProperty("id", node_id)
                    .set("name", data.nodes[node_id]['name'])
                    .set("hostname", data.nodes[node_id]['hostname'])
                    .set("http_address", data.nodes[node_id]['http_address'])
                    .set("jvm_heap_max", data.nodes[node_id]['jvm']['mem']['heap_max'])
                    .set("start_time",   data.nodes[node_id]['jvm']['start_time'])
      }

      // Remove missing nodes from the collection
      // TODO: Use model instance identity for this
      //
      self.forEach(function(item) {
        var loc = self.content.length || 0
        while(--loc >= 0) {
          var curObject = self.content.objectAt(loc)
          if ( item && !Ember.keys(data.nodes).contains(item.id) && curObject.id === item.id) {
            self.content.removeAt(loc)
          }
        }
      })

      App.nodes.refresh();
    };

    var __load_nodes_stats = function(data) {
      for (var node_id in data.nodes) {
        var node = self.findProperty("id", node_id)
        if (node) {
          node
            .set("disk", data.nodes[node_id]['indices']['store']['size'])
            .set("docs", data.nodes[node_id]['indices']['docs']['count'])
            .set("load", data.nodes[node_id]['os']['load_average'][0])
            .set("cpu",  data.nodes[node_id]['process']['cpu']['percent'])
        }
      }
    };

    App.set("refreshing", true)
    $.getJSON(App.elasticsearch_url+"/_cluster/nodes?jvm", __load_nodes_info);
    $.getJSON(App.elasticsearch_url+"/_cluster/nodes/stats?indices&os&process", __load_nodes_stats);
  }
});

App.indices = Ember.ArrayController.create({
  content: [],

  contains: function(item) {
    return (Ember.typeOf(item) == 'string') ? this.mapProperty('name').contains(item) : this._super();
  },

  refresh: function() {
    clearTimeout(App.indices.poller)
    setTimeout(function() { App.set("refreshing", false) }, 1000)
    App.indices.poller = setTimeout( function() { App.indices.__perform_refresh() }, App.refresh_interval.value )
  },

  showDetail: function(event) {
    // l(event.context.name)
    // l(this)
    event.context.toggleProperty("show_detail")
  },

  __perform_refresh: function() {
    if (!App.refresh_allowed) { return }
    var self = this;

    var __load_cluster_state = function(data) {
      for (var index_name in data.metadata.indices) {
        // Mark master node
        //
        var master_node  = App.nodes.content.findProperty("id", data.master_node)
        if (master_node) master_node.set("master", true)

        // Create or find an index
        //
        if ( !self.contains(index_name) ) self.addObject(App.Index.create({ name: index_name }))
        var index = self.findProperty("name", index_name)

        // Update index properties
        //
        index
          .set("state", data.metadata.indices[index_name]['state'])

          .set("settings", Ember.Object.create({
            number_of_replicas: data.metadata.indices[index_name]['settings']['index.number_of_replicas'],
            number_of_shards:   data.metadata.indices[index_name]['settings']['index.number_of_shards']
          }))

          .set("aliases", data.metadata.indices[index_name]['aliases'])

        // Shards
        //
        var shards     = [],
                  primaries  = [],
                  replicas   = [],
                  unassigned = []

        index
          .set("shards", function() {
            if (data.routing_table.indices[index_name]) {

              for (var shard_name in data.routing_table.indices[index_name]['shards']) {

                data.routing_table.indices[index_name]['shards'][shard_name].forEach(function(s) {

                  var shard = App.Index.Shard.create({name: shard_name})
                  shard.set("state",   s.state)
                       .set("primary", s.primary)
                       .set("index",   s.index)
                       .set("node_id", s.node)
                       .set("relocating_node_id", s.relocating_node)

                  if (s.primary)             primaries .addObject(shard)
                  if (!s.primary && s.node)  replicas  .addObject(shard)
                  if (!s.primary && !s.node) unassigned.addObject(shard)
                });

              }
            }

            // Sort unassingned shards to series [0 .. n, 0 .. n]
            // [0, 0, 1, 1, 2, 2] becomes: [0, 1, 2, 0, 1, 2]
            //
            var unassigned_sorted = []
            unassigned_sorted.length = unassigned.length

            var num_shards   = primaries.length,
                num_replicas = unassigned.length/num_shards;

            for (var i = 0; i < num_shards; i++) {
              // Create slices: [0, 0]; [1, 1]; [2, 2]
              unassigned.slice(i*num_replicas, i*num_replicas+num_replicas).forEach(function(item,index) {
                // Position for first slices:  0, 3
                // Position for second slices: 1, 4
                // Position for third slices:  2, 5
                var position = i + num_shards * index
                unassigned_sorted[position] = item
              })
            };

            unassigned_sorted = unassigned_sorted.filter(function(i){return i != null})
            return shards.concat(primaries, replicas, unassigned_sorted)
          }())

          if (index.show_detail) {
            index.set("nodes", function() {
              var nodes = []
              if (data.routing_table.indices[index_name]) {
                for (var shard_name in data.routing_table.indices[index_name]['shards']) {

                  data.routing_table.indices[index_name]['shards'][shard_name].forEach(function(shard_data) {
                    if (shard_data.node) {

                      // Find the node
                      // var node = App.nodes.content.findProperty("id", shard_data.node)
                      var node = nodes.findProperty("id", shard_data.node)
                      if (!node) {
                        var node = App.Node.create( App.nodes.content.findProperty("id", shard_data.node) )
                        nodes.addObject(node)
                      }

                      // Initialize node.shards
                      if (node && !node.shards) node.set("shards", [])

                      // Find shard in index.shards
                      var shard = index.shards.find(function(item) {
                                    return item.name == shard_data.shard && item.node_id == shard_data.node && item.index == shard_data.index
                                  })

                      // Remove shard from node.shards
                      node.shards.forEach(function(item, index) {
                        if (item.name == shard_data.shard && item.node_id == shard_data.node && item.index == shard_data.index) {
                            node.shards.removeAt(index)
                        }
                      })

                      // Add (possibly updated) shard back into collection
                      if (shard) { node.shards.addObject(shard) }

                      node.set("shards", node.shards.sort(function(a,b) { return a.name > b.name; }))
                    }
                  });
                };
              }
              index.set("show_detail_loaded", true)
              return nodes
            }())
          }

        // Remove deleted indices from the collection
        // TODO: Use model instance identity for this
        //
        self.forEach(function(item) {
          // console.log(item.name)
          var loc = self.content.length || 0
          while(--loc >= 0) {
            var curObject = self.content.objectAt(loc)
            if ( item && !Ember.keys(data.metadata.indices).contains(item.name) && curObject.name === item.name) {
              self.content.removeAt(loc)
            }
          }
        })

        // TODO: Sort indices by name
        // self.set( "content", self.content.sort(function(a,b) { return a.name > b.name }) )
      }
    };

    var __load_indices_stats = function(data) {
      for (var index_name in data._all.indices) {
        var index = self.findProperty("name", index_name)
        if (!index) continue

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
        if (!index.show_detail) continue

        for (var shard_name in data.indices[index_name]['shards']) {
          // var shard = index.shards.findProperty("name", shard_name)

          data.indices[index_name]['shards'][shard_name].forEach(function(shard_data) {
            var shard = index.shards.find(function(item) {
                                  return item.name == shard_name && item.node_id == shard_data['routing']['node']
                                })
            // if (!shard) continue
            if (shard) {

              // l(shard_data)
              shard
                .set("size", shard_data.index.size)
                // .set("docs", shard_data.docs.num_docs)
              shard
                .set("recovery", function() {
                  var recovery_type = shard_data['peer_recovery'] ? 'peer_recovery' : 'gateway_recovery'

                  return {
                    stage:    shard_data[recovery_type].stage,
                    time:     shard_data[recovery_type].time,
                    progress: shard_data[recovery_type].index.progress,
                    size:     shard_data[recovery_type].index.size,
                    reused_size: shard_data[recovery_type].index.reused_size
                  }
                }())
            }
          });
        }
      }
    };

    App.set("refreshing", true)
    $.getJSON(App.elasticsearch_url+"/_cluster/state",        __load_cluster_state);
    $.getJSON(App.elasticsearch_url+"/_stats",                __load_indices_stats);
    $.getJSON(App.elasticsearch_url+"/_status?recovery=true", __load_indices_status);

    // Schedule next run
    //
    App.indices.refresh();
  }
});

// ===== Views ==================================================================================

App.toggleRefreshAllowedButton = Ember.View.create({
  text: 'Stop',

  toggle: function(event) {
    this.set("text", ( App.refresh_allowed == true ) ? 'Start' : 'Stop')
    App.toggleProperty("refresh_allowed")
  }
});

App.toggleChart = Ember.View.create({
  text: 'Hide',

  toggle: function(event) {
    var chart   = $("#chart"),
        visible = chart.is(":visible")
    this.set("text", visible ? 'Show' : 'Hide')
    visible ? chart.hide('fast') : chart.show('fast')
  }
});

// ===== Observers ==============================================================================

App.addObserver('elasticsearch_url', function(event) {
  // TODO: Use the `blur` event, so we're not trying to load partial URLs
  Ember.Logger.log("ElasticSearch URL changed to " + this.get("elasticsearch_url"))
  App.cluster.set("content", App.Cluster.create({}))
  App.nodes.set("content", [])
  App.indices.set("content", [])
  App.ready()
  App.Cubism.reset();
});

App.addObserver('refresh_interval', function() {
  Ember.Logger.log("Refresh interval changed to " + App.refresh_interval.label)
  App.ready()
});

App.addObserver('refresh_allowed', function() {
  App.ready()
});
