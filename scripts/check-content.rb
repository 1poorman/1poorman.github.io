# frozen_string_literal: true

require 'date'
require 'yaml'

root = File.expand_path('..', __dir__)
errors = []
check = ->(condition, message) { errors << message unless condition }
read_yaml = lambda do |path, front_matter: false|
  text = File.read(File.join(root, path))
  if front_matter
    match = text.match(/\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|\z)/m)
    raise "#{path}: missing front matter" unless match
    text = match[1]
  end
  YAML.safe_load(text, permitted_classes: [Date, Time], aliases: false)
rescue Psych::Exception, RuntimeError => e
  errors << "#{path}: #{e.message}"
  nil
end

topics = read_yaml.call('_data/topics.yml') || []
kinds = read_yaml.call('_data/article_kinds.yml') || {}
projects = read_yaml.call('_data/projects.yml') || []
home = read_yaml.call('_data/home.yml') || {}
topic_ids = topics.map { |topic| topic['id'] }
check.call(topic_ids.uniq == topic_ids, 'Topic IDs must be unique')
topics.each do |topic|
  %w[id name description question icon].each do |field|
    check.call(topic[field].is_a?(String) && !topic[field].strip.empty?, "Topic #{topic['id']}: missing #{field}")
  end
  check.call(topic['id'].to_s.match?(/\A[a-z0-9]+(?:-[a-z0-9]+)*\z/), "Invalid topic ID: #{topic['id']}")
end

posts = {}
Dir.glob(File.join(root, '_posts', '*.md')).sort.each do |file|
  path = file.delete_prefix("#{root}/")
  metadata = read_yaml.call(path, front_matter: true)
  next unless metadata.is_a?(Hash)
  posts[path] = metadata
  next if metadata['listed'] == false

  %w[title summary category].each do |field|
    check.call(metadata[field].is_a?(String) && !metadata[field].strip.empty?, "#{path}: missing #{field}")
  end
  check.call(kinds.key?(metadata['kind']), "#{path}: unknown kind #{metadata['kind'].inspect}")
  %w[topics tags].each do |field|
    values = metadata[field]
    check.call(values.is_a?(Array) && !values.empty? && values.all? { |value| value.is_a?(String) && !value.strip.empty? },
               "#{path}: #{field} must be a nonempty string array")
  end
  article_topics = Array(metadata['topics'])
  check.call((article_topics - topic_ids).empty?, "#{path}: unknown topic IDs #{article_topics - topic_ids}")
  first_topic = topics.find { |topic| topic['id'] == article_topics.first }
  check.call(first_topic && metadata['category'] == first_topic['name'], "#{path}: category must match the first topic's display name")
  if metadata['last-updated']
    begin
      Date.iso8601(metadata['last-updated'].to_s)
    rescue Date::Error
      errors << "#{path}: last-updated must use YYYY-MM-DD"
    end
  end
end

listed_posts = posts.reject { |_, post| post['listed'] == false }
check.call(projects.map { |project| project['id'] }.uniq.size == projects.size, 'Project IDs must be unique')
projects.each do |project|
  check.call(project['url'].to_s.start_with?('https://github.com/'), "Project #{project['id']}: missing GitHub URL")
  check.call((Array(project['topics']) - topic_ids).empty?, "Project #{project['id']}: unknown topics")
  Array(project['related_posts']).each do |path|
    check.call(listed_posts.key?(path), "Project #{project['id']}: related post is missing or unlisted: #{path}")
  end
end

featured = home['featured'] || {}
featured_post = listed_posts[featured['post_path']]
check.call(featured_post && featured_post['kind'] == 'experiment', 'Featured post must refer to a listed experiment')
comparison = featured['comparison'] || {}
maximum = comparison['maximum']
check.call(maximum.is_a?(Numeric) && maximum.positive?, 'Featured comparison needs a positive scale maximum')
%w[title metric unit direction source].each do |field|
  check.call(!comparison[field].to_s.strip.empty?, "Featured comparison is missing #{field}")
end
check.call(Array(comparison['rows']).size >= 2, 'Featured comparison needs at least two rows')
Array(comparison['rows']).each do |row|
  value = row['value']
  check.call(value.is_a?(Numeric) && value >= 0 && maximum.is_a?(Numeric) && value <= maximum,
             "Featured comparison: invalid value for #{row['label']}")
end

unless errors.empty?
  warn errors.join("\n")
  exit 1
end
puts "Content OK: #{listed_posts.size} listed posts, #{posts.size - listed_posts.size} retained samples, #{topics.size} topics, #{projects.size} projects"
