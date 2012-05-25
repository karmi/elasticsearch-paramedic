// Set up Cubism.js context
//
var context = cubism.context()
    .serverDelay(0)
    .clientDelay(0)
    .step(1000)
    .size($("#chart").width());

// Set up chart canvas
//
var chart = d3.select("#chart");

chart.append("div")
    .attr("class", "axis top")
    .call(context.axis().orient("top"));

chart.append("div")
    .attr("class", "rule")
    .call(context.rule());

context.on("focus", function(i) { d3.selectAll(".value").style("right", i == null ? null : context.size() - i + "px"); });


// Function to add new chart
//
chart.add = function(metrics, options) {
  var options = options || {colors: 'Greens'}

  chart.selectAll(".horizon")
      .data(metrics, function(d) { return d.toString(); })
    .enter().append("div")
      .attr("class", "horizon")
      .call(context.horizon()
        .height(25)
        .colors(function() { return colorbrewer[options['colors']][8] })
      )
  return chart;
};

// Set up ElasticSearch metrics
//
var elasticsearch = cubism.elasticsearch(context, {host: "http://localhost:9200"}, function() {
  var default_metrics = [
    { metrics: this.metrics("os.cpu.user"),                    colors: 'Greens'   },
    { metrics: this.metrics("process.cpu.percent"),            colors: 'Greens'   },
    { metrics: this.metrics("jvm.mem.heap_used_in_bytes"),     colors: 'Blues'    },
    { metrics: this.metrics("http.current_open"),              colors: 'Oranges'  },
    { metrics: this.metrics("indices.indexing.index_current"), colors: 'Spectral' },
    { metrics: this.metrics("indices.search.query_current"),   colors: 'YlOrRd'   }
  ]
  // Add default metrics
  //
  default_metrics.forEach( function(group) { chart.add(group.metrics, {colors: group.colors}); } );
});
