STDOUT.sync = true

require 'rake'
require 'tire'

namespace :index do

  COUNT = (ENV['COUNT'] || 10).to_i
  LEAVE = (ENV['LEAVE'] || 2 ).to_i

  desc "Create indices (pass COUNT in ENV)"
  task :create do
    1.upto(COUNT) do |i|
      print "#{i}. "
      Tire.index("index_#{i}") do
        create
        store title: "Test doc"
      end
    end
  end

  desc "Remove indices (pass LEAVE in ENV)"
  task :remove do
    COUNT.downto(LEAVE) do |i|
      print "#{i}. "
      Tire.index("index_#{i}").delete
    end
  end

  desc "Search an index in loop"
  task :search do
    trap(:INT) { exit }
    INDEX = ENV['INDEX'] || 'index_1'
    loop do
      Tire.search(INDEX) { query { all } }.results
      print '.'
      sleep 0.2
    end
  end

end
