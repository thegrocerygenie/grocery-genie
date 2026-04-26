// GroceryGenieWidgets.swift
// Home Screen + Lock Screen widgets for Grocery Genie.
//
// This is a Widget Extension target — File → New → Target → Widget Extension
// in your Xcode project that Expo generates. Three widget families:
//   - .systemSmall    (home screen — ring + caption)
//   - .systemMedium   (home screen — ring + categories)
//   - .accessoryRectangular (lock screen — single line + ring)
//   - .accessoryCircular    (lock screen / watch complication)
//
// Data comes from a shared App Group (group.com.grocerygenie.shared).
// React Native writes to UserDefaults(suiteName:); SwiftUI reads the same.

import WidgetKit
import SwiftUI

// MARK: - Timeline data

struct BudgetEntry: TimelineEntry {
    let date: Date
    let spent: Double
    let cap: Double
    let monthLabel: String        // "April · day 19"
    let daysLeft: Int
    let topCategories: [CategoryItem]

    var progress: Double { min(spent / cap, 1.0) }
    var remaining: Double { max(0, cap - spent) }
    var isOver: Bool { spent > cap }
}

struct CategoryItem: Hashable {
    let name: String
    let symbol: String     // SF Symbol name
    let color: Color
    let spent: Double
    let cap: Double
}

// MARK: - Provider — reads from App Group

struct BudgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> BudgetEntry {
        .sample
    }
    func getSnapshot(in context: Context, completion: @escaping (BudgetEntry) -> Void) {
        completion(load() ?? .sample)
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<BudgetEntry>) -> Void) {
        let entry = load() ?? .sample
        // Refresh every hour — RN side calls WidgetCenter.reloadAll() on receipt save
        let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date())!
        completion(Timeline(entries: [entry], policy: .after(next)))
    }

    private func load() -> BudgetEntry? {
        guard let defaults = UserDefaults(suiteName: "group.com.grocerygenie.shared"),
              let data = defaults.data(forKey: "budget-snapshot"),
              let snap = try? JSONDecoder().decode(BudgetSnapshotJSON.self, from: data)
        else { return nil }
        return snap.toEntry()
    }
}

// JSON shape that React Native writes from JS-side helper
struct BudgetSnapshotJSON: Codable {
    let spent: Double
    let cap: Double
    let monthLabel: String
    let daysLeft: Int
    let categories: [CategoryJSON]

    func toEntry() -> BudgetEntry {
        BudgetEntry(
            date: Date(),
            spent: spent, cap: cap,
            monthLabel: monthLabel, daysLeft: daysLeft,
            topCategories: categories.prefix(3).map {
                CategoryItem(name: $0.name, symbol: $0.symbol,
                             color: Color(hex: $0.colorHex),
                             spent: $0.spent, cap: $0.cap)
            }
        )
    }
}
struct CategoryJSON: Codable {
    let name: String; let symbol: String; let colorHex: String
    let spent: Double; let cap: Double
}

// MARK: - The ring (matches Dashboard.tsx physics)

struct BudgetRing: View {
    let progress: Double
    let isOver: Bool
    var size: CGFloat = 88

    var body: some View {
        ZStack {
            Circle()
                .stroke(Color.secondary.opacity(0.15), lineWidth: 12)
            Circle()
                .trim(from: 0, to: progress)
                .stroke(
                    isOver ? Color.red : Color(hex: "1F7A4A"),
                    style: StrokeStyle(lineWidth: 12, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))
                .animation(.spring(response: 0.6, dampingFraction: 0.7), value: progress)
        }
        .frame(width: size, height: size)
    }
}

// MARK: - Small widget (home screen)

struct SmallWidgetView: View {
    let entry: BudgetEntry
    var body: some View {
        VStack(spacing: 4) {
            ZStack {
                BudgetRing(progress: entry.progress, isOver: entry.isOver, size: 88)
                VStack(spacing: 0) {
                    Text(entry.isOver ? "\(Int(entry.progress * 100))%" : "$\(Int(entry.remaining))")
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .foregroundStyle(entry.isOver ? Color.red : .primary)
                        .monospacedDigit()
                    Text(entry.isOver ? "over" : "left")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Text(entry.monthLabel)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .containerBackground(.background, for: .widget)
    }
}

// MARK: - Medium widget (home screen — ring + categories)

struct MediumWidgetView: View {
    let entry: BudgetEntry
    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                BudgetRing(progress: entry.progress, isOver: entry.isOver, size: 100)
                VStack(spacing: 0) {
                    Text(entry.isOver ? "\(Int(entry.progress * 100))%" : "$\(Int(entry.remaining))")
                        .font(.system(.title3, design: .rounded, weight: .bold))
                        .foregroundStyle(entry.isOver ? Color.red : .primary)
                        .monospacedDigit()
                    Text("of $\(Int(entry.cap))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(entry.monthLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(entry.topCategories.prefix(3), id: \.self) { cat in
                    HStack(spacing: 6) {
                        Image(systemName: cat.symbol)
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(.white)
                            .frame(width: 18, height: 18)
                            .background(cat.color, in: Circle())
                        Text(cat.name).font(.caption)
                        Spacer()
                        Text("$\(Int(cat.spent))")
                            .font(.system(.caption, design: .rounded, weight: .semibold))
                            .monospacedDigit()
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
        .containerBackground(.background, for: .widget)
    }
}

// MARK: - Lock screen rectangular

struct LockRectView: View {
    let entry: BudgetEntry
    var body: some View {
        HStack(spacing: 8) {
            BudgetRing(progress: entry.progress, isOver: entry.isOver, size: 36)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 0) {
                Text(entry.isOver ? "Over by $\(Int(entry.spent - entry.cap))" : "$\(Int(entry.remaining)) left")
                    .font(.system(.body, design: .rounded, weight: .semibold))
                    .monospacedDigit()
                Text("\(entry.daysLeft) days · \(entry.monthLabel.split(separator: "·").first.map(String.init)?.trimmingCharacters(in: .whitespaces) ?? "")")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Lock screen / watch circular

struct LockCircleView: View {
    let entry: BudgetEntry
    var body: some View {
        ZStack {
            Circle().stroke(.tertiary, lineWidth: 4)
            Circle()
                .trim(from: 0, to: entry.progress)
                .stroke(entry.isOver ? Color.red : .primary,
                        style: StrokeStyle(lineWidth: 4, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("$\(Int(entry.remaining))")
                .font(.system(.caption2, design: .rounded, weight: .bold))
                .monospacedDigit()
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

// MARK: - Widget definitions

struct GroceryGenieWidget: Widget {
    let kind = "GroceryGenieBudget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BudgetProvider()) { entry in
            switch entry.date.formatted() {
            default: SmallWidgetView(entry: entry)  // unreachable; family-routed below
            }
        }
        .configurationDisplayName("Budget")
        .description("Your monthly grocery budget at a glance.")
        .supportedFamilies([
            .systemSmall, .systemMedium,
            .accessoryRectangular, .accessoryCircular
        ])
    }
}

// Apple's preferred way to switch by family is the @Environment-based router:
struct WidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    let entry: BudgetEntry
    var body: some View {
        switch family {
        case .systemSmall:           SmallWidgetView(entry: entry)
        case .systemMedium:          MediumWidgetView(entry: entry)
        case .accessoryRectangular:  LockRectView(entry: entry)
        case .accessoryCircular:     LockCircleView(entry: entry)
        default:                     SmallWidgetView(entry: entry)
        }
    }
}

// MARK: - Bundle entry point

@main
struct GroceryGenieWidgetsBundle: WidgetBundle {
    var body: some Widget {
        GroceryGenieWidget()
        ScanLiveActivity()  // see ScanLiveActivity.swift
    }
}

// MARK: - Helpers

extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0; Scanner(string: h).scanHexInt64(&v)
        self.init(.sRGB,
                  red:   Double((v >> 16) & 0xFF)/255,
                  green: Double((v >> 8)  & 0xFF)/255,
                  blue:  Double( v        & 0xFF)/255,
                  opacity: 1)
    }
}

extension BudgetEntry {
    static var sample: BudgetEntry {
        BudgetEntry(
            date: Date(), spent: 242, cap: 400,
            monthLabel: "April · day 19", daysLeft: 11,
            topCategories: [
                .init(name: "Groceries", symbol: "cart.fill",         color: Color(hex: "34C759"), spent: 142, cap: 175),
                .init(name: "Beverages", symbol: "cup.and.saucer.fill", color: Color(hex: "5856D6"), spent: 33,  cap: 30),
                .init(name: "Household", symbol: "house.fill",        color: Color(hex: "007AFF"), spent: 27,  cap: 50),
            ]
        )
    }
}
