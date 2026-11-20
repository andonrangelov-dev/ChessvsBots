// Chess vs Bots - shows the App Store page of Chess Tactics Gym inside the app,
// so the player does not leave the game. Uses SKStoreProductViewController only:
// no in-app purchases, no tracking. GPL v3 (same as the app).
import Foundation
import Capacitor
import StoreKit

@objc(StoreSheetPlugin)
public class StoreSheetPlugin: CAPPlugin, CAPBridgedPlugin, SKStoreProductViewControllerDelegate {
    public let identifier = "StoreSheetPlugin"
    public let jsName = "StoreSheet"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let appId = call.getString("appId"), !appId.isEmpty,
              appId.allSatisfy({ $0.isASCII && $0.isNumber }), let numericId = Int64(appId) else {
            call.reject("appId (numeric App Store id) is required")
            return
        }
        var params: [String: Any] = [SKStoreProductParameterITunesItemIdentifier: NSNumber(value: numericId)]
        if let pt = call.getString("providerToken"), !pt.isEmpty { params[SKStoreProductParameterProviderToken] = pt }
        if let ct = call.getString("campaignToken"), !ct.isEmpty { params[SKStoreProductParameterCampaignToken] = ct }

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.bridge?.viewController else {
                call.reject("no view controller")
                return
            }
            let store = SKStoreProductViewController()
            store.delegate = self
            store.loadProduct(withParameters: params) { loaded, error in
                DispatchQueue.main.async {
                    if loaded {
                        // present on top of whatever is shown (e.g. a modal) so the call never fails silently
                        var top: UIViewController = presenter
                        while let next = top.presentedViewController { top = next }
                        top.present(store, animated: true)
                        call.resolve()
                    } else {
                        call.reject(error?.localizedDescription ?? "the App Store page could not be loaded")
                    }
                }
            }
        }
    }

    public func productViewControllerDidFinish(_ viewController: SKStoreProductViewController) {
        viewController.dismiss(animated: true)
    }
}
