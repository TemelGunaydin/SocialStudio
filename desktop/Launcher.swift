import AppKit

@MainActor
final class Launcher: NSObject, NSApplicationDelegate {
    private var child: Process?
    private var timer: Timer?
    private var window: NSWindow!
    private var status: NSTextField!
    private var openButton: NSButton!
    private var panelURL: URL?
    private var readyFile: URL?
    private var logHandle: FileHandle?
    private var ticks = 0
    private var openingURL: URL?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let item = NSMenuItem()
        let actions = NSMenu()
        actions.addItem(withTitle: "Social Studio’yu kapat", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        item.submenu = actions
        menu.addItem(item)
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 220), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Social Studio"
        window.isReleasedWhenClosed = false
        let title = NSTextField(labelWithString: "Paylaşım alanın bu Mac’te.")
        title.font = .systemFont(ofSize: 22, weight: .semibold)
        title.frame = NSRect(x: 28, y: 150, width: 410, height: 32)
        status = NSTextField(wrappingLabelWithString: "Yerel panel hazırlanıyor…")
        status.frame = NSRect(x: 28, y: 78, width: 404, height: 66)
        openButton = NSButton(title: "Paneli aç", target: self, action: #selector(openPanel))
        openButton.bezelStyle = .rounded
        openButton.frame = NSRect(x: 25, y: 25, width: 140, height: 36)
        openButton.isEnabled = false
        window.contentView?.addSubview(title)
        window.contentView?.addSubview(status)
        window.contentView?.addSubview(openButton)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        do { try startServer() } catch { showFailure("Uygulama başlatılamadı. Yerel veri klasörü izinlerini kontrol edin.") }
    }

    private func startServer() throws {
        let files = FileManager.default
        let home = files.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Social Studio", isDirectory: true)
        try files.createDirectory(at: home, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
        let ready = home.appendingPathComponent(".ready-\(UUID().uuidString).json")
        readyFile = ready
        let log = home.appendingPathComponent("server.log")
        if !files.fileExists(atPath: log.path) { files.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
        try files.setAttributes([.posixPermissions: 0o600], ofItemAtPath: log.path)
        logHandle = try FileHandle(forWritingTo: log)
        try logHandle?.seekToEnd()
        guard let resources = Bundle.main.resourceURL else { throw CocoaError(.fileNoSuchFile) }
        let process = Process()
        process.executableURL = resources.appendingPathComponent("runtime/bin/node")
        process.arguments = [resources.appendingPathComponent("studio/server/index.mjs").path]
        process.currentDirectoryURL = resources.appendingPathComponent("studio")
        process.environment = ["HOME": files.homeDirectoryForCurrentUser.path, "PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "STUDIO_HOME": home.path, "STUDIO_READY_FILE": ready.path]
        process.standardOutput = FileHandle.nullDevice
        process.standardError = logHandle
        process.standardInput = FileHandle.nullDevice
        try process.run()
        child = process
        // Selector timer stays on AppKit's main run loop; no UI crosses threads.
        timer = Timer.scheduledTimer(timeInterval: 0.2, target: self, selector: #selector(pollServer), userInfo: nil, repeats: true)
    }

    @objc private func pollServer() {
        ticks += 1
        guard let child, child.isRunning else {
            showFailure("Yerel sunucu durdu. 3000 portunda başka bir uygulama çalışıyor olabilir. Ayrıntılar: ~/Library/Application Support/Social Studio/server.log")
            return
        }
        if panelURL == nil, let readyFile, let data = try? Data(contentsOf: readyFile),
           let info = try? JSONSerialization.jsonObject(with: data) as? [String: String],
           let value = info["url"], let url = URL(string: value) {
            try? FileManager.default.removeItem(at: readyFile)
            panelURL = URL(string: value.components(separatedBy: "#")[0])
            openingURL = url
            status.stringValue = "Panel tarayıcında açılır. Bu pencereyi kapatmak sunucuyu durdurmaz; çıkmak için ⌘Q kullan. Anahtarlar ve taslaklar yalnızca bu Mac’te saklanır."
            openButton.isEnabled = true
            openPanel()
        } else if panelURL == nil && ticks > 75 {
            child.terminate()
            showFailure("Yerel sunucu zamanında açılamadı. Uygulamayı kapatıp yeniden deneyin.")
        }
    }

    @objc private func openPanel() {
        if let url = openingURL ?? panelURL { NSWorkspace.shared.open(url) }
        // Keep the first-run fragment for reopening until the app restarts; server ignores it after setup.
    }

    private func showFailure(_ message: String) {
        timer?.invalidate()
        status.stringValue = message
        openButton.isEnabled = false
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        openPanel()
        return true
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard child?.isRunning == true else { return .terminateNow }
        let alert = NSAlert()
        alert.messageText = "Yerel panel kapatılsın mı?"
        alert.informativeText = "Devam eden üretim veya yayın varsa tamamlanmasını bekle. Uygulama kapalıyken günlük taslak hazırlanmaz."
        alert.addButton(withTitle: "Açık kalsın")
        alert.addButton(withTitle: "Kapat")
        return alert.runModal() == .alertSecondButtonReturn ? .terminateNow : .terminateCancel
    }

    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate()
        if child?.isRunning == true { child?.terminate() }
        if let readyFile { try? FileManager.default.removeItem(at: readyFile) }
        try? logHandle?.close()
    }
}

@main
struct SocialStudioApp {
    @MainActor static func main() {
        let app = NSApplication.shared
        let delegate = Launcher()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }
}
