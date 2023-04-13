import { Queue } from "./collections.js";
export function matMulPt(v, m) {
    const x = v.x, y = v.y;
    v.x = x * m[0] + y * m[2] + m[4];
    v.y = x * m[1] + y * m[3] + m[5];
    return v;
}
export function getExtents(points) {
    const length = points.length, p0 = points[0];
    let xmin = p0.x, ymin = p0.y, xmax = p0.x, ymax = p0.y;
    for (let i = 0; i < length; i++) {
        const pi = points[i];
        xmin = Math.min(xmin, pi.x);
        ymin = Math.min(ymin, pi.y);
        xmax = Math.max(xmax, pi.x);
        ymax = Math.max(ymax, pi.y);
    }
    return { xmin: xmin, ymin: ymin, xmax: xmax, ymax: ymax };
}
export function pointToPointDist(p1, p2) {
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
}
export function projectPointToLine(p1, p2, p) {
    const p1p2x = p2.x - p1.x, p1p2y = p2.y - p1.y, p1px = p.x - p1.x, p1py = p.y - p1.y, p1p2Squared = p1p2x * p1p2x + p1p2y * p1p2y;
    if (p1p2Squared == 0) {
        // Degenerate line, choose p1.
        return { x: p1.x, y: p1.y, t: 0 };
    }
    const p1pDotp1p2 = p1px * p1p2x + p1py * p1p2y, t = p1pDotp1p2 / p1p2Squared;
    return { x: p1.x + t * (p2.x - p1.x), y: p1.y + (p2.y - p1.y) * t, t: t };
}
export function projectPointToSegment(p1, p2, p) {
    const projection = projectPointToLine(p1, p2, p), t = projection.t;
    if (t <= 0) {
        return { x: p1.x, y: p1.y, t: 0 };
    }
    if (t >= 1) {
        return { x: p2.x, y: p2.y, t: 1 };
    }
    return projection;
}
export function projectPointToCircle(p, center, radius) {
    const dx = p.x - center.x, dy = p.y - center.y;
    if (dx === 0 && dy === 0) {
        // Point is center, arbitrarily project to the rightmost point of the circle.
        return { x: center.x, y: center.y, nx: 1, ny: 0 };
    }
    const scale = 1 / Math.sqrt(dx * dx + dy * dy), nx = dx * scale, ny = dy * scale, x = center.x + nx * radius, y = center.y + ny * radius;
    return {
        x, y, nx, ny
    };
}
// Distance to infinite line through p1, p2.
export function pointToLineDist(p1, p2, p) {
    const projection = projectPointToLine(p1, p2, p);
    return pointToPointDist(projection, p);
}
// Distance to line segment between p1, p2.
export function pointToSegmentDist(p1, p2, p) {
    const projection = projectPointToLine(p1, p2, p);
    return pointToPointDist(projection, p);
}
export function pointOnSegment(p1, p2, p, tolerance) {
    return pointToSegmentDist(p1, p2, p) < tolerance;
}
export function lineIntersection(p0, p1, p2, p3) {
    const p0x = p0.x, p0y = p0.y, p1x = p1.x, p1y = p1.y, p2x = p2.x, p2y = p2.y, p3x = p3.x, p3y = p3.y, s1x = p1x - p0x, s1y = p1y - p0y, s2x = p3x - p2x, s2y = p3y - p2y, d = (-s2x * s1y + s1x * s2y);
    if (Math.abs(d) > 0.000001) {
        const s = (-s1y * (p0x - p2x) + s1x * (p0y - p2y)) / d, t = (s2x * (p0y - p2y) - s2y * (p0x - p2x)) / d;
        return { x: p0x + t * s1x, y: p0y + t * s1y, s: s, t: t };
    }
    // Parallel or coincident.
    return undefined;
}
// Evaluate bezier segment by deCastlejau algorithm.
export function evaluateBezier(b, t) {
    var tp = 1.0 - t;
    var s11 = { x: b[0].x * tp + b[1].x * t, y: b[0].y * tp + b[1].y * t }, s12 = { x: b[1].x * tp + b[2].x * t, y: b[1].y * tp + b[2].y * t }, s13 = { x: b[2].x * tp + b[3].x * t, y: b[2].y * tp + b[3].y * t }, s21 = { x: s11.x * tp + s12.x * t, y: s11.y * tp + s12.y * t }, s22 = { x: s12.x * tp + s13.x * t, y: s12.y * tp + s13.y * t }, s31 = { x: s21.x * tp + s22.x * t, y: s21.y * tp + s22.y * t };
    return s31;
}
export function hitTestBezier(p1, p2, p3, p4, p, tolerance) {
    const beziers = new Queue();
    beziers.enqueue([p1, p2, p3, p4, 0, 1]);
    let dMin = Number.MAX_VALUE, closestX = 0, closestY = 0, tMin = 0;
    while (beziers.length() > 0) {
        const [b0, b1, b2, b3, t0, t1] = beziers.dequeue();
        // Get control point distances from the segment defined by the curve endpoints.
        const d1 = pointToLineDist(b0, b3, b1), d2 = pointToLineDist(b0, b3, b2), curvature = Math.max(d1, d2);
        // Get p distance from the segment.
        const t = projectPointToSegment(b0, b3, p).t, projX = b0.x + t * (b3.x - b0.x), projY = b0.y + t * (b3.y - b0.y), dx = p.x - projX, dy = p.y - projY, d = Math.sqrt(dx * dx + dy * dy);
        if (d - curvature > tolerance)
            continue;
        if (curvature <= tolerance) {
            if (d < dMin) {
                dMin = d;
                tMin = t0 + t * (t1 - t0);
                closestX = projX;
                closestY = projY;
            }
        }
        else {
            // Subdivide into two curves at t = 0.5.
            const s11 = { x: (b0.x + b1.x) * 0.5, y: (b0.y + b1.y) * 0.5 }, s12 = { x: (b1.x + b2.x) * 0.5, y: (b1.y + b2.y) * 0.5 }, s13 = { x: (b2.x + b3.x) * 0.5, y: (b2.y + b3.y) * 0.5 }, s21 = { x: (s11.x + s12.x) * 0.5, y: (s11.y + s12.y) * 0.5 }, s22 = { x: (s12.x + s13.x) * 0.5, y: (s12.y + s13.y) * 0.5 }, s31 = { x: (s21.x + s22.x) * 0.5, y: (s21.y + s22.y) * 0.5 }, tMid = t0 + 0.5 * (t1 - t0);
            beziers.enqueue([b0, s11, s21, s31, t0, tMid]);
            beziers.enqueue([s31, s22, s13, b3, tMid, t1]);
        }
    }
    if (dMin < tolerance)
        return { x: closestX, y: closestY, d: dMin, t: tMin };
}
//# sourceMappingURL=geometry.js.map