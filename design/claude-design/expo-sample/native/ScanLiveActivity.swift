// ScanLiveActivity.swift
// Live Activity + Dynamic Island for the receipt-scan processing state.
//
// Lives in the same Widget Extension target as GroceryGenieWidgets.swift.
// Started from React Native via `expo-live-activity` (or a small bridge):
//   ActivityKit.Activity<ScanAttributes>.request(...)
//
// States, in order:
//   1. capturing        — photo just taken, uploading
//   2. parsing          — OCR running on N items
//   3. parsed           — done; tap to review
//   4. error            — couldn't read; tap to retry
//
// Dynamic Island has three layouts: compact (leading + trailing), expanded
// (regions for any rich content), and minimal (single glyph). We provide
// all three so the system picks the right one for the context.

import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Activity attributes

struct ScanAttributes: ActivityAttributes {
    public typealias ContentState = ScanState

    // Static for the lifetime of the activity
    let store: String          // "Trader Joe's"
    let startedAt: Date

    public struct ScanState: Codable, Hashable {
        var phase: Phase
        var progress: Double       // 0...1 — drives the bar / ring
        var itemsParsed: Int
        var itemsTotal: Int        // 0 if unknown
        var total: Double?         // populated once known
        var errorMessage: String?

        public enum Phase: String, Codable { case capturing, parsing, parsed, error }
    }
}

// MARK: - Live Activity

struct ScanLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ScanAttributes.self) { ctx in
            // Lock Screen / banner presentation
            LockScreenView(attrs: ctx.attributes, state: ctx.state)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { ctx in
            DynamicIsland {
                // EXPANDED — appears when long-pressed or auto-revealed
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: phaseIcon(ctx.state.phase))
                        .font(.title2)
                        .foregroundStyle(phaseColor(ctx.state.phase))
                        .symbolEffect(.pulse, isActive: ctx.state.phase == .parsing)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let total = ctx.state.total {
                        Text("$\(total, specifier: "%.2f")")
                            .font(.system(.title3, design: .rounded, weight: .bold))
                            .monospacedDigit()
                    } else {
                        Text("\(ctx.state.itemsParsed)/\(max(ctx.state.itemsTotal, 1))")
                            .font(.system(.title3, design: .rounded, weight: .bold))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ctx.attributes.store)
                            .font(.headline)
                        Text(phaseLabel(ctx.state))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if ctx.state.phase == .parsed {
                        Link(destination: URL(string: "grocerygenie://review")!) {
                            HStack {
                                Text("Review receipt")
                                    .font(.system(.body, weight: .semibold))
                                Spacer()
                                Image(systemName: "chevron.right")
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, 12)
                            .background(Color(hex: "1F7A4A"), in: Capsule())
                            .foregroundStyle(.white)
                        }
                    } else if ctx.state.phase == .error {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundStyle(.orange)
                            Text(ctx.state.errorMessage ?? "Couldn't read receipt")
                                .font(.caption)
                        }
                    } else {
                        ProgressView(value: ctx.state.progress)
                            .tint(Color(hex: "1F7A4A"))
                    }
                }
            } compactLeading: {
                // COMPACT — what most users see, around the camera notch
                Image(systemName: phaseIcon(ctx.state.phase))
                    .foregroundStyle(phaseColor(ctx.state.phase))
                    .symbolEffect(.pulse, isActive: ctx.state.phase == .parsing)
            } compactTrailing: {
                Group {
                    switch ctx.state.phase {
                    case .capturing, .parsing:
                        Text("\(Int(ctx.state.progress * 100))%")
                            .monospacedDigit()
                    case .parsed:
                        if let total = ctx.state.total {
                            Text("$\(total, specifier: "%.0f")")
                                .monospacedDigit()
                        } else {
                            Image(systemName: "checkmark")
                        }
                    case .error:
                        Image(systemName: "exclamationmark")
                    }
                }
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(phaseColor(ctx.state.phase))
            } minimal: {
                // MINIMAL — when multiple activities compete for the island
                Image(systemName: phaseIcon(ctx.state.phase))
                    .foregroundStyle(phaseColor(ctx.state.phase))
            }
            .widgetURL(URL(string: "grocerygenie://scan"))
            .keylineTint(Color(hex: "1F7A4A"))
        }
    }
}

// MARK: - Lock screen presentation

struct LockScreenView: View {
    let attrs: ScanAttributes
    let state: ScanAttributes.ScanState

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(phaseColor(state.phase).opacity(0.18))
                    .frame(width: 44, height: 44)
                Image(systemName: phaseIcon(state.phase))
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(phaseColor(state.phase))
                    .symbolEffect(.pulse, isActive: state.phase == .parsing)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(attrs.store)
                    .font(.system(.headline, weight: .semibold))
                    .foregroundStyle(.white)
                Text(phaseLabel(state))
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
                if state.phase != .parsed && state.phase != .error {
                    ProgressView(value: state.progress)
                        .tint(Color(hex: "1F7A4A"))
                        .frame(maxWidth: 200)
                }
            }
            Spacer()
            if let total = state.total, state.phase == .parsed {
                Text("$\(total, specifier: "%.2f")")
                    .font(.system(.title3, design: .rounded, weight: .bold))
                    .monospacedDigit()
                    .foregroundStyle(.white)
            }
        }
        .padding(14)
    }
}

// MARK: - Phase helpers

private func phaseIcon(_ p: ScanAttributes.ScanState.Phase) -> String {
    switch p {
    case .capturing: return "camera.fill"
    case .parsing:   return "doc.text.viewfinder"
    case .parsed:    return "checkmark.circle.fill"
    case .error:     return "exclamationmark.triangle.fill"
    }
}
private func phaseColor(_ p: ScanAttributes.ScanState.Phase) -> Color {
    switch p {
    case .capturing: return Color(hex: "1F7A4A")
    case .parsing:   return Color(hex: "1F7A4A")
    case .parsed:    return Color(hex: "34C759")
    case .error:     return .orange
    }
}
private func phaseLabel(_ s: ScanAttributes.ScanState) -> String {
    switch s.phase {
    case .capturing: return "Capturing photo…"
    case .parsing:
        if s.itemsTotal > 0 { return "Reading \(s.itemsParsed) of \(s.itemsTotal) items" }
        return "Reading receipt…"
    case .parsed:
        if let t = s.total { return "Done · $\(String(format: "%.2f", t))" }
        return "Tap to review"
    case .error:
        return s.errorMessage ?? "Couldn't read receipt"
    }
}
