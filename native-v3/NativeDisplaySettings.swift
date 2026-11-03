import Cocoa

struct NativeDisplaySettings: Codable {
    var explorer=true
    var tags=true
    var variants=false
    var counts=true
    var listWidth:Double=1000
    var explorerHeight:Double=215
    var textSize:Double=13
    var chatViewMode:String?=nil
    var minPromptBytes:Int?=nil
    var sizeMode:String?=nil
    var rowDensity:String?=nil
    var projectColorMode:String?="auto"
    var columns:[String:Bool]?=nil
    var widths:[String:Double]?=nil

    func showsColumn(_ id:String)->Bool {
        if id == "title" {return true}
        if let value=columns?[id] {return value}
        return ["date","provider","project","status","source"].contains(id)
    }

    static func load() -> NativeDisplaySettings {
        guard let data=UserDefaults.standard.data(forKey:"V3DisplaySettings"),let value=try? JSONDecoder().decode(Self.self,from:data) else{return Self()}
        return value
    }
    func save(){if let data=try? JSONEncoder().encode(self){UserDefaults.standard.set(data,forKey:"V3DisplaySettings")}}
    static func fromV2(_ text:String)->NativeDisplaySettings? {
        guard let data=text.data(using:.utf8),let object=try? JSONSerialization.jsonObject(with:data) as? [String:Any] else{return nil}
        let options=object["options"] as? [String:Any] ?? [:]
        var value=Self()
        if let v=options["explorer"] as? Bool {value.explorer=v}
        if let v=options["tags"] as? Bool {value.tags=v}
        if let v=options["versions"] as? Bool {value.variants=v}
        if let v=options["counts"] as? Bool {value.counts=v}
        if let mode=object["projectColorMode"] as? String,["auto","neutral","manual"].contains(mode) {value.projectColorMode=mode}
        if var columns=object["columns"] as? [String:Bool] {columns["provider"]=columns["llm"];value.columns=columns}
        if var widths=object["widths"] as? [String:Double] {widths["provider"]=widths["llm"];value.widths=widths}
        return value
    }
}
