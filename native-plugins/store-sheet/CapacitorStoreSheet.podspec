Pod::Spec.new do |s|
  s.name = 'CapacitorStoreSheet'
  s.version = '1.0.0'
  s.summary = 'In-app App Store product page (SKStoreProductViewController) for Chess vs Bots.'
  s.license = { :type => 'GPL-3.0-or-later' }
  s.homepage = 'https://github.com/andonrangelov-dev/ChessvsBots'
  s.author = 'Andon Rangelov'
  s.source = { :git => 'https://github.com/andonrangelov-dev/ChessvsBots.git', :tag => s.version.to_s }
  s.source_files = 'ios/Sources/**/*.{swift,h,m}'
  s.ios.deployment_target = '15.0'
  s.frameworks = 'StoreKit'
  s.dependency 'Capacitor'
  s.swift_version = '5.1'
end
