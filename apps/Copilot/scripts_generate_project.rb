require 'xcodeproj'
require 'fileutils'

root = File.expand_path(File.dirname(__FILE__))
project_path = File.join(root, 'DragonFruitMini.xcodeproj')
FileUtils.rm_rf(project_path)

project = Xcodeproj::Project.new(project_path)
project.root_object.attributes['LastUpgradeCheck'] = '1600'

app_target = project.new_target(:application, 'DragonFruitMini', :osx, '13.0')
app_target.product_reference.name = 'DragonFruitMini.app'

app_target.build_configurations.each do |config|
  settings = config.build_settings
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'sh.dragonfruit.copilot'
  settings['SWIFT_VERSION'] = '5.0'
  settings['MACOSX_DEPLOYMENT_TARGET'] = '13.0'
  settings['INFOPLIST_FILE'] = 'Info.plist'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['DEVELOPMENT_TEAM'] = ''
  settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  settings['ASSETCATALOG_COMPILER_APPICON_NAME'] = ''
  settings['ENABLE_HARDENED_RUNTIME'] = 'YES'
  settings['LD_RUNPATH_SEARCH_PATHS'] = ['$(inherited)', '@executable_path/../Frameworks']
end

sources_group = project.main_group.find_subpath('Sources', true)
resources_group = project.main_group.find_subpath('Resources', true)

Dir.glob(File.join(root, 'Sources', '*.swift')).each do |file|
  ref = sources_group.new_file(file)
  app_target.add_file_references([ref])
end

Dir.glob(File.join(root, 'Resources', '**', '*')).each do |file|
  next if File.directory?(file)
  ref = resources_group.new_file(file)
  app_target.resources_build_phase.add_file_reference(ref)
end

plist_path = File.join(root, 'Info.plist')
File.write(plist_path, <<~PLIST)
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>DragonFruit Atlas</string>
  <key>CFBundleDisplayName</key>
  <string>DragonFruit Atlas</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSMinimumSystemVersion</key>
  <string>13.0</string>
  <key>NSMicrophoneUsageDescription</key>
  <string>DragonFruit Atlas uses the microphone when you start voice capture, so it can answer questions, create workspace items, or type dictation.</string>
  <key>NSAudioCaptureUsageDescription</key>
  <string>DragonFruit Atlas captures system audio when you start meeting notes, so remote speakers in calls can be transcribed.</string>
  <key>NSSpeechRecognitionUsageDescription</key>
  <string>DragonFruit Atlas transcribes your voice when you use Atlas voice or dictation.</string>
  <key>LSApplicationCategoryType</key>
  <string>public.app-category.productivity</string>
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLName</key>
      <string>dragonfruitmini.oauth</string>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>dragonfruitmini</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
PLIST

project.save
puts "Generated #{project_path}"
