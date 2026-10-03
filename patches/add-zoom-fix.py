"""Patch the shared image zoom controls without changing editor layout.

The native/common editor's touch and compatibility mouse handlers could each
create an interval, overwriting the only stored handle. Pointer events avoid
that duplicate start; restarting, releasing, losing focus and leaving the
editor all stop the existing interval.
"""

from pathlib import Path
import argparse


OLD_CONTROLLER = 'ds=b(null),cr=()=>{pl(),ds.value=setInterval(()=>{pl()},50)},dr=()=>{gl(),ds.value=setInterval(()=>{gl()},50)},yo=()=>{ds.value&&(clearInterval(ds.value),ds.value=null)},pl='
NEW_CONTROLLER = 'ds=b(null),cr=ne=>{if(ne&&ne.button>0)return;yo();if(ne){ne.preventDefault();try{ne.currentTarget.setPointerCapture(ne.pointerId)}catch{}}pl(),ds.value=setInterval(pl,50)},dr=ne=>{if(ne&&ne.button>0)return;yo();if(ne){ne.preventDefault();try{ne.currentTarget.setPointerCapture(ne.pointerId)}catch{}}gl(),ds.value=setInterval(gl,50)},yo=()=>{ds.value!==null&&(clearInterval(ds.value),ds.value=null)},pl='

OLD_LIFECYCLE = 'gl=()=>{m.value=m.value-.01,o.width=m.value*o.naturalWidth,o.height=m.value*o.naturalHeight,Oe()},Ra='
NEW_LIFECYCLE = 'gl=()=>{m.value=m.value-.01,o.width=m.value*o.naturalWidth,o.height=m.value*o.naturalHeight,Oe()},kardsZoomLifecycle=(()=>{rr(yo),Os(yo),Xn("pointerup",yo,{capture:!0}),Xn("pointercancel",yo,{capture:!0}),Xn("blur",yo),Xn("visibilitychange",yo,{target:document});return null})(),Ra='

OLD_PLUS = 'onTouchstart:p[51]||(p[51]=$=>cr()),onTouchend:yo,onMousedown:p[52]||(p[52]=$=>cr()),onMouseup:yo,onMouseleave:yo'
NEW_PLUS = 'style:{"touch-action":"none"},onPointerdown:p[51]||(p[51]=$=>cr($)),onPointerup:yo,onPointercancel:yo,onLostpointercapture:yo,onClick:p[52]||(p[52]=$=>{$.detail===0&&pl()})'
OLD_MINUS = 'onTouchstart:p[54]||(p[54]=$=>dr()),onTouchend:yo,onTouchcancel:yo,onMousedown:p[55]||(p[55]=$=>dr()),onMouseup:yo,onMouseleave:yo'
NEW_MINUS = 'style:{"touch-action":"none"},onPointerdown:p[54]||(p[54]=$=>dr($)),onPointerup:yo,onPointercancel:yo,onLostpointercapture:yo,onClick:p[55]||(p[55]=$=>{$.detail===0&&gl()})'


def patch(source: str) -> str:
    """Apply after common, steel and azur component cloning; safe to repeat."""
    changes = (
        (OLD_CONTROLLER, NEW_CONTROLLER),
        (OLD_LIFECYCLE, NEW_LIFECYCLE),
        (OLD_PLUS, NEW_PLUS),
        (OLD_MINUS, NEW_MINUS),
    )
    if all(source.count(new) == 3 and old not in source for old, new in changes):
        return source
    for old, new in changes:
        count = source.count(old)
        if count != 3:
            raise ValueError(f'Expected 3 matching zoom sections; found {count}: {old[:70]}')
        source = source.replace(old, new)
    assert OLD_CONTROLLER not in source
    assert source.count('kardsZoomLifecycle=') == 3
    return source


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('files', nargs='*', type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    paths = args.files or [
        root / 'web-trial/assets/index-CTw2cKeY.js',
        root / 'apk-work/assets/public/assets/index-CTw2cKeY.js',
    ]
    for path in paths:
        source = path.read_text(encoding='utf-8')
        updated = patch(source)
        if updated != source:
            path.write_text(updated, encoding='utf-8')
        print(f'{path.name}: image zoom pointer handlers verified (3 editors)')


if __name__ == '__main__':
    main()
