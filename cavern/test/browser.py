#!/usr/bin/env python3
"""Exercise real CHASM controls, rendering and downloads at a Pages-like subpath.

Development dependency: Python Playwright. Browser executable optional; use
--browser /path/to/chrome-headless-shell in constrained/headless environments.
Screenshots are optional local inspection output, never required runtime assets.
"""
import argparse
import asyncio
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
from xml.etree import ElementTree
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[2]
PREFIX='/x3d.gamelab/'

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not self.path.startswith(PREFIX):
            self.send_error(404);return
        self.path=self.path[len(PREFIX)-1:]
        return super().do_GET()
    def log_message(self,*args):pass

async def run(args,port):
    errors=[];responses=[];checks=[]
    def check(name,condition,detail=None):
        checks.append({'name':name,'pass':bool(condition),'detail':detail})
        if not condition:raise AssertionError(name+': '+str(detail))
    async with async_playwright() as p:
        browser=await p.chromium.launch(**({'executable_path':args.browser} if args.browser else {}),headless=True,args=['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
        page=await browser.new_page(viewport={'width':1280,'height':900},accept_downloads=True)
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
        page.on('response',lambda r:responses.append({'status':r.status,'url':r.url}) if r.status>=400 else None)
        await page.goto(f'http://127.0.0.1:{port}{PREFIX}cavern/')
        await page.wait_for_function('window.__chasm?.view?.frameStats',timeout=60000)
        check('intro and WebGL scene visible',await page.locator('#intro').is_visible() and await page.evaluate('__chasm.view.stats().triangles>1000'))
        if args.screenshots:await page.screenshot(path=str(args.screenshots/'intro.png'))
        await page.locator('#settings-btn').click()
        await page.locator('#quality').select_option('low')
        await page.locator('#close-lab').click()
        await page.locator('#launch').click()
        await page.wait_for_function('__chasm.sim.time>.08',timeout=30000)
        await page.locator('#pause').click()
        stopped=await page.evaluate('__chasm.sim.time')
        await page.wait_for_timeout(350)
        check('pause stops physical time',await page.evaluate('__chasm.paused&&__chasm.sim.time')==stopped,stopped)
        await page.locator('#settings-btn').click()
        await page.locator('#param-windSpeed').press('End')
        check('wind slider changes authoritative force model',await page.evaluate('__chasm.sim.params.windSpeed')==25)
        await page.locator('#param-windSpeed').press('Home')
        await page.locator('#assistance').uncheck()
        check('assistance switch reaches simulation',await page.evaluate('__chasm.sim.params.assistance') is False)
        await page.locator('#assistance').check()
        await page.locator('#close-lab').click()
        check('closing lab returns flight focus',await page.evaluate('document.activeElement.id')=='world')
        await page.locator('#limp').click()
        check('limp button releases active pose',await page.evaluate('__chasm.limp') is True)
        await page.keyboard.press('f')
        check('shortcuts work while control button focused',await page.evaluate('__chasm.limp') is False)
        await page.keyboard.press('p')
        await page.wait_for_function('!__chasm.paused&&__chasm.sim.time>'+str(stopped+.05),timeout=30000)
        check('keyboard resumes from button focus',await page.evaluate('__chasm.paused') is False)
        await page.locator('#pause').click()
        await page.locator('#settings-btn').click()
        for mode in ['helmet','orbit','chase']:
            await page.locator('#camera').select_option(mode)
            await page.wait_for_timeout(150)
            check('camera '+mode,await page.evaluate('__chasm.view.cameraMode')==mode)
        await page.locator('#overlays').check()
        await page.locator('#comfort').check()
        async with page.expect_download() as d:
            await page.locator('#export-settings').click()
        config=json.loads(Path(await (await d.value).path()).read_text())
        check('settings download preserves schema',config['schema']=='chasm-settings/1' and config['physics']['windSpeed']==0)
        async with page.expect_download() as d:
            await page.locator('#export-x3d').click()
        xml=ElementTree.parse(await (await d.value).path())
        check('live X3D download is complete',len(xml.findall('.//RigidBody'))==14 and len(xml.findall('.//Shape[@DEF]'))>=16)
        async with page.expect_download() as d:
            await page.locator('#export-csv').click()
        csv=Path(await (await d.value).path()).read_text()
        check('CSV has SI header and samples','air_speed_m_s' in csv and len(csv.strip().splitlines())>2)
        # Advance the actual fixed-step model while paused to inspect virtual
        # rendering without waiting a minute on a software rasterizer.
        await page.evaluate('''()=>{const s=__chasm.sim;while(s.p[2]<1100&&s.state==='flying')s.step(1/120,{});}''')
        await page.locator('#close-lab').click()
        await page.wait_for_timeout(250)
        check('virtual course section renders',await page.evaluate('__chasm.sim.p[2]>=1100&&__chasm.view.stats().triangles>1000'))
        if args.screenshots:await page.screenshot(path=str(args.screenshots/'virtual.png'))
        await page.locator('#settings-btn').click()
        await page.locator('#quality').select_option('high')
        await page.wait_for_timeout(200)
        check('cinematic graphics renders',await page.evaluate('__chasm.view.stats().quality')=='high')
        await page.locator('#quality').select_option('low')
        await page.locator('#close-lab').click()
        # Phone-sized coarse-pointer surface, layout and touch controls.
        phone=await browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        phone.on('pageerror',lambda e:errors.append(str(e)))
        await phone.goto(f'http://127.0.0.1:{port}{PREFIX}cavern/')
        await phone.wait_for_function('window.__chasm?.view?.frameStats',timeout=60000)
        check('390px layout has no horizontal overflow',await phone.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        await phone.locator('#launch').click()
        check('touch flight controls visible',await phone.locator('.touch-controls').is_visible())
        await phone.locator('#settings-btn').click()
        check('phone laboratory scrolls inside screen',await phone.locator('#lab').is_visible() and await phone.evaluate("document.getElementById('lab').getBoundingClientRect().right<=innerWidth"))
        if args.screenshots:await phone.screenshot(path=str(args.screenshots/'phone.png'))
        stats=await page.evaluate('({render:__chasm.view.stats(),physicsMs:__chasm.physicsMs,renderSubmitMs:__chasm.renderMs,droppedWallTime:__chasm.clock.dropped,simTime:__chasm.sim.time})')
        check('zero browser errors and HTTP failures',not errors and not responses,{'errors':errors,'http':responses})
        result={'status':'pass','browser':await browser.version() if callable(browser.version) else browser.version,'scope':'Headless Chromium / SwiftShader on one host; functional rendering evidence, not hardware GPU FPS. Model fast-forward used for virtual region.','checks':checks,'stats':stats}
        args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result,indent=2))
        await browser.close()

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--browser');p.add_argument('--output',type=Path,default=ROOT/'cavern/docs/browser-validation.json');p.add_argument('--screenshots',type=Path)
    args=p.parse_args()
    if args.screenshots:args.screenshots.mkdir(parents=True,exist_ok=True)
    srv=ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
    threading.Thread(target=srv.serve_forever,daemon=True).start()
    try:asyncio.run(run(args,srv.server_port))
    finally:srv.shutdown();srv.server_close()

if __name__=='__main__':main()
