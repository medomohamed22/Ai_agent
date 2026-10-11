from playwright.sync_api import sync_playwright
from pathlib import Path
import json
html=Path(__file__).resolve().parents[1].joinpath('index.html').read_text()
checks=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':390,'height':844})
 page.set_default_timeout(1400)
 page.route('**/*',lambda route:route.abort() if route.request.url.startswith(('https://','http://')) else route.continue_())
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 
 try: page.set_content(html,wait_until='commit',timeout=3500)
 except Exception: pass
 def check(name,fn):
  try: fn();checks.append((name,'PASS'))
  except Exception as e: checks.append((name,'FAIL: '+str(e)[:220]))
 def assert_eq(a,b): assert a==b,(a,b)
 def assert_true(a): assert a,a
 check('composer toolbar removed',lambda:assert_true(not page.locator('.smartbar').is_visible()))
 check('reasoning panel removed from composer',lambda:assert_true(not page.locator('#reasonPanel').is_visible()))
 check('separate dollar cost removed',lambda:assert_eq(page.locator('.cost-chip').count(),0))
 check('slash popup appears on /',lambda:(page.locator('#in').fill('/'),assert_true(page.locator('#slashSuggestions').is_visible())))
 check('slash popup filters',lambda:(page.locator('#in').fill('/cont'),assert_eq(page.locator('#slashSuggestions button').count(),1)))
 check('slash tap autocomplete',lambda:(page.locator('#slashSuggestions button').click(),assert_eq(page.locator('#in').input_value(),'/context ')))
 check('slash popup closes on normal text',lambda:(page.locator('#in').fill('hello'),assert_true(not page.locator('#slashSuggestions').is_visible())))
 check('settings tools moved',lambda:(page.locator('#st').evaluate('(e)=>e.click()'),page.locator('[data-t="o"]').evaluate('(e)=>e.click()'),assert_true(page.locator('#to .smartbar').is_visible())))
 check('reasoning in settings',lambda:assert_true(page.locator('#to #reasonPanel').is_visible()))
 check('effort change in settings',lambda:(page.locator('#effort').select_option('high'),assert_eq(page.locator('#effort').input_value(),'high')))
 check('context button in settings',lambda:(page.locator('#ctxBtn').evaluate('(e)=>e.click()'),assert_true('استهلاك السياق' in page.locator('#smartPanel').inner_text())))
 check('no unexpected JS errors',lambda:assert_true(not [e for e in errors if 'Indexed Database API is denied' not in e]))
 page.screenshot(path=str(Path(__file__).resolve().parents[1]/'ui_cleanup_mobile.png'),full_page=True)
 browser.close()
print(json.dumps(checks,ensure_ascii=False,indent=2))
assert all(r=='PASS' for _,r in checks)
