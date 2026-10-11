from playwright.sync_api import sync_playwright
import json
base='file:///mnt/data/aiway_browser_test/index.html'
results=[]
def check(name, fn):
 try:
  detail=fn();results.append({'test':name,'status':'PASS','detail':str(detail)[:160]})
 except Exception as e:results.append({'test':name,'status':'FAIL','detail':str(e)[:240]})
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1440,'height':900},accept_downloads=True)
 page.set_default_timeout(2500)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def load_html():
  try: page.set_content(open('/mnt/data/aiway_browser_test/index.html').read(),wait_until='domcontentloaded',timeout=7000)
  except Exception: pass # external asset loading can time out in the restricted browser
  assert page.title() == 'AiWay', 'HTML did not load'
  return page.title()
 check('load home',load_html)
 check('app initialization',lambda:page.locator('#msgs').count() and page.locator('#go').count() or (_ for _ in ()).throw(Exception('missing UI')))
 check('settings open',lambda:(page.locator('#st').click(),page.locator('#ov').get_attribute('class')))
 check('settings tabs',lambda:[x.inner_text() for x in page.locator('#ov button').all()])
 check('settings close',lambda:page.locator('#cl').evaluate('(el)=>el.click()'))
 check('context panel',lambda:(page.locator('#ctxBtn').click(),page.locator('#smartPanel').inner_text()[:180]))
 check('slash command panel',lambda:(page.locator('#slashBtn').click(),page.locator('#smartPanel').inner_text()[:180]))
 check('RAG library',lambda:(page.locator('#ragBtn').click(),page.locator('#smartPanel').inner_text()[:180]))
 check('jobs panel',lambda:(page.locator('#jobsBtn').click(),page.locator('#smartPanel').inner_text()[:180]))
 check('effort selection',lambda:(page.locator('#effort').select_option('high'),page.locator('#effort').input_value()))
 check('reasoning expand',lambda:(page.locator('#reasonPanel summary').click(),page.locator('#reasonPanel').get_attribute('open')))
 check('new conversation',lambda:(page.locator('#nw').click(),page.locator('#msgs').inner_text()[:80]))
 check('chat input',lambda:(page.locator('#in').fill('/context'),page.locator('#in').input_value()))
 check('javascript runtime errors (excluding opaque-origin IndexedDB)',lambda: (_ for _ in ()).throw(Exception('; '.join([e for e in errors if 'Indexed Database API is denied in this context' not in e]))) if any('Indexed Database API is denied in this context' not in e for e in errors) else 'no app errors; IndexedDB unavailable in set_content origin')
 page.screenshot(path='/mnt/data/aiway_browser_test/browser_home.png',full_page=True)
 browser.close()
print(json.dumps(results,ensure_ascii=False,indent=2));open('/mnt/data/aiway_browser_test/browser_results.json','w').write(json.dumps(results,ensure_ascii=False,indent=2))
