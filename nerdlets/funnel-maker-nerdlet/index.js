import React from 'react';
import {
  NrqlQuery,
  PlatformStateContext, EntitiesByDomainTypeQuery,
  AccountPicker, TextField,
  Grid, GridItem, Checkbox, Radio, RadioGroup,
  Tabs, TabsItem, Card, CardHeader, CardBody,
    BarChart, TableChart, FunnelChart } from 'nr1';
import {timeRangeToNrql} from "@newrelic/nr1-community";
// https://docs.newrelic.com/docs/new-reßlic-programmable-platform-introduction
import { Flowpoint, Flowspace } from 'flowpoints';

export default class FacetMakerNerdletNerdlet extends React.Component {

  constructor() {
    super(...arguments);
    this.state = {
      since: '',
      accountId: null,
      sessionList: [],
      points: [],
      pageList: [],
      selectedList: [],
      sessionMap: {},
      mergedMap: {},
      eventTarget: [true, false], // 0: PageView, 1: BrowserInteraction
      applications: []
    };
  }

  componentDidMount() {
    const { accountId, applications, eventTarget, since } = this.state;
    console.log("hoge")
    if (!accountId) {
      return;
    }
    NrqlQuery.query({
      accountId,
      query: "FROM PageView SELECT count(*) FACET session LIMIT 200 " + since
    }).then((r)=> r.data.chart)
      .then((sessionList)=>{
        var sessionIdList = sessionList.map(d=>`'${d.metadata.name}'`);
        return Promise.all([eventTarget[0] && NrqlQuery.query({
          accountId,
          query: `FROM PageView SELECT session, pageUrl, appName WHERE session in (${sessionIdList.join(',')}) 
          ${(applications.length > 0 && applications.find(a=>a.checked)) ? ('AND appName in (' + applications.filter(a=>a.checked).map(a=>`'${a.label}'`).join(',') + ')') : ''} LIMIT 2000 ` + since
        }),eventTarget[1] && NrqlQuery.query({
          accountId,
          query: `FROM BrowserInteraction SELECT session, previousUrl, targetUrl, appName WHERE previousUrl != targetUrl AND session in (${sessionIdList.join(',')}) 
          ${(applications.length > 0 && applications.find(a=>a.checked)) ? ('AND appName in (' + applications.filter(a=>a.checked).map(a=>`'${a.label}'`).join(',') + ')') : ''} LIMIT 2000 ` + since
        })
        ]);
      })
      .then((results)=>{

        const sessionMap = {};
        results[0] && results[0].data.chart.length > 0 && results[0].data.chart[0].data.reverse().forEach(d=>{
          sessionMap[d.session] = sessionMap[d.session] || {current: '', relation: {}};
          if (sessionMap[d.session].current) {
            sessionMap[d.session].relation[sessionMap[d.session].current][d.pageUrl]
              = (sessionMap[d.session].relation[sessionMap[d.session].current][d.pageUrl]||0)+1;
          }
          sessionMap[d.session].relation[d.pageUrl]
            = sessionMap[d.session].relation[d.pageUrl] || {};
          sessionMap[d.session].current = d.pageUrl;
          applications.find(a=>a.label == d.appName) || applications.push({ label: d. appName, checked: false})
        });
        results[1] && results[1].data.chart.length > 0 && results[1].data.chart[0].data.reverse().forEach(d=>{
          sessionMap[d.session] = sessionMap[d.session] || {current: '', relation: {}};
            sessionMap[d.session].relation[d.previousUrl]
              = sessionMap[d.session].relation[d.previousUrl] || {};
            sessionMap[d.session].relation[d.previousUrl][d.targetUrl]
              = (sessionMap[d.session].relation[d.previousUrl][d.targetUrl]||0)+1;
        });
        const mergedMap = {};
        const linedMap ={label: '', children: []};

        //Initialize UserAccessPoints
        Object.entries(sessionMap).forEach(entry=>{
          Object.entries(entry[1].relation).forEach(r=>{
            mergedMap[r[0]] = mergedMap[r[0]] || new UserAccessPoint(r[0]);
          });
        });

        // Make A relation to Child/Parent points

        Object.entries(sessionMap).forEach(entry=> {
          Object.entries(entry[1].relation).forEach(r => {
            Object.entries(r[1]).forEach(k => {
              mergedMap[r[0]].childlen[k[0]] = mergedMap[r[0]].childlen[k[0]] || {node: mergedMap[k[0]], point: 0};
              mergedMap[r[0]].childlen[k[0]].point++;
              mergedMap[k[0]].parents[r[0]] = mergedMap[k[0]].parents[r[0]] || {node: mergedMap[k[0]], point: 0};
              mergedMap[k[0]].parents[r[0]].point++;
            })
          })
        });

        //Set main nodes
        Object.values(mergedMap).forEach(v=>{
          v.parent = Object.values(v.parents).reduce((r, p)=>v.point>p.point ? v : p, {node: null, point: -1});
          v.firstChild = Object.values(v.childlen).reduce((r, p)=>v.point>p.point ? v : p, {node: null, point: -1});
        });


        /*
        Object.entries(sessionMap).forEach(entry=>{
          Object.entries(entry[1].relation).forEach(r=>{
            mergedMap[r[0]] = mergedMap[r[0]] || new UserAccessPoint(r[0]);
            //mergedMap[r[0]] = mergedMap[r[0]] || { label: r[0], parent: {node: null, point: 0}, firstChild: null, childlen: {}};
            Object.entries(mergedMap).forEach(entry=>{
              const childEntry = Object.entries(entry[1].childlen).find(child=>child[0]==r[0]);
              if (!childEntry) return;
              const childParent = mergedMap[r[0]].parent;
              if (childParent.point < childEntry[1]) {
                childParent.node = entry[1];
                childParent.point = childEntry[1];
              }
              mergedMap[entry[0]].firstChild = mergedMap[r[0]];
            });
            Object.entries(r[1]).forEach(k=>{
              mergedMap[r[0]].childlen[k[0]] = mergedMap[r[0]].childlen[k[0]] || {node: mergedMap[k[0]], point: 0};
              (r[0] === k[0]) ? 0 : (mergedMap[r[0]].childlen[k[0]]||0) + k[1];
            });
          })
        });
        */

        // make a map
        const points = [];
        const ww = window.innerWidth/2;
        const mmcol = Math.floor(ww / 200 );
        let col=0, row=0;
        const checked = {};
        while(Object.values(mergedMap).find(v=>!v.checked)) {
          let tmp = Object.values(mergedMap).filter(e => !e.checked).find(entry => !entry.parent.node)
            || Object.values(mergedMap).filter(e => !e.checked).reduce((r, v) => r.parent.point > v.parent.point ? r : v, {parent: {point: 0}});
          const set = [];
          col = 0;
          while (tmp) {
            if (!checked[tmp.url]) {
              set.push(tmp);
              checked[tmp.url] = tmp;
              tmp.checked = true;
              tmp.x = col * 200;
              tmp.y = row * 80;
              col++;
              if (col >= mmcol) {
                col = 0;
                row++;
              }
            } else {
              break;
            }
            tmp = tmp.firstChild.node;
            if (!tmp || tmp == tmp.firstChild.node) break;
          }
          if (set.length > 0) {
            points.push(set);
            col > 0 && row++;
          }
        }
        this.setState({ pageList: eventTarget[0] ? results[0].data.chart : eventTarget[1] ? results[1].data.chart:[],
        points, sessionMap, mergedMap})
      });
  }

  onChangeAccount(value) {
    this.state.accountId = value;
    this.componentDidMount();
  }

  onSelect(value) {
    this.setState({ accountId: value });
  }

  onChangeEventType(eventTarget) {
    this.state.eventTarget = eventTarget;
    this.state.selectedList = [];
    this.componentDidMount();
  }

  toggleApplication(app) {
    app.checked = !app.checked;
    this.componentDidMount();
  }

  render() {
    const {sessionList, pageList, eventTarget, selectedList, accountId, since, mergedMap, points, applications} = this.state;
    return (
      <PlatformStateContext.Consumer>
        {(platformStateContext) => {
          const {duration, begin_time, end_time} = platformStateContext.timeRange;
          const nextSince = timeRangeToNrql({timeRange: platformStateContext.timeRange});
          if (since != nextSince) {
            this.setState({since: nextSince});
          }
          return (
            <>
              <div className={'toolbox'}>
              <AccountPicker
                value={this.state.accountId}
                onChange={(value) => this.onChangeAccount(value)}
              />
              <RadioGroup>
                <Radio
                  checked={this.state.eventTarget[0]}
                  onClick={()=>this.onChangeEventType([ true, false ])}
                  label="PageView"
                />
                <Radio
                  checked={this.state.eventTarget[1]}
                  onClick={()=>this.onChangeEventType([ false,true ])}
                  label="BrowserInteraction"
                />
              </RadioGroup>
                <div className={'applications'}>
                  {applications.map(a=>(<Checkbox label={a.label} checked={a.checked} onChange={()=>this.toggleApplication(a)} />))}
                </div>
              </div>
              <Grid className={'userTrace'}>
                <GridItem columnSpan={6}>
                  <Card className={'fullHeight'}>
                    <CardHeader title="Entities"/>
                    <CardBody>
                      <></>
                      <Flowspace arrowEnd={true}
                                 theme={'green'}
                                 style={{height: '100%', width: '100%'}}
                      >
                        {points.map(set => set.map(s =>  (
                          <Flowpoint key={s.url}
                                     startPosition={{x: s.x, y: s.y}}
                                     snap={{x: 10, y: 10}}
                                     style={{overflowWrap: 'anywhere', userSelect: 'none'}}
                                     theme={'green'}
                                     variant={!!s.selected ? 'filled' : 'outlined'}
                                     onClick={e => {
                                       s.selected = !s.selected;
                                       if (s.selected) {
                                         selectedList.push(s);
                                         s.showChildlen(s.url);
                                       } else {
                                         selectedList.splice(selectedList.indexOf(s), 1);
                                         s.removeRoot(s.url);
                                       }
                                       this.setState({ selectedList: selectedList.filter(d=>d.selected)});
                                     }}
                                     outputs={Object.keys(s.childlen).reduce((r, k) => {
                                       r[k] = {output: 'auto', input: "auto",
                                         outputColor: s.selected?'lime':'grey', inputColor: s.selected?'lime':'grey',
                                         width:s.selected?5:2, dash: s.selected || s.shown ? 0 : 5};
                                       return r;
                                     }, {})}>
                            {s.url}
                            {s.selected && (<div className={'pointLabel'}>Page {selectedList.indexOf(s)}</div>)}
                          </Flowpoint>
                        )))}
                      </Flowspace>
                    </CardBody>
                  </Card>
                </GridItem>
                <GridItem columnSpan={6} className={'preview'}>
                  <Card>
                    <CardHeader title="Query"/>
                    <CardBody>
                      {eventTarget[0] ? `FROM PageView SELECT funnel(session, ${selectedList.map((u, idx) => `WHERE pageUrl = '${u.url}' as 'Page ${idx}'`).join(',')})
                      ${(applications.length > 0 && applications.find(a=>a.checked)) ? ('AND appName in (' + applications.filter(a=>a.checked).map(a=>`'${a.label}'`) + ')') : ''} ${since}`
                      : eventTarget[1] ? `FROM BrowserInteraction SELECT funnel(session, ${selectedList.map((u, idx) => `WHERE targetUrl = '${u.url}' as 'Page ${idx}'`).join(',')})
                      ${(applications.length > 0 && applications.find(a=>a.checked)) ? ('AND appName in (' + applications.filter(a=>a.checked).map(a=>`'${a.label}'`) + ')') : ''} ${since}`
                          : 'Please select URL'
                      }
                    </CardBody>
                  </Card>
                  <div className={'space'}/>
                  <Card className={'funnel'}>
                    <CardHeader title="Funnel Sample"/>
                    <CardBody className={'funnelBody'}>
                  <FunnelChart
                    accountId={accountId}
                    query={eventTarget[0] ? `FROM PageView SELECT funnel(session, ${selectedList.map((u, idx) => `WHERE pageUrl = '${u.url}' as 'Page ${idx}'`).join(',')})
                      ${(applications.length > 0 && applications.find(a=>a.checked)) ? ('AND appName in (' + applications.filter(a=>a.checked).map(a=>`'${a.label}'`) + ')') : ''} ${since}`
                      : eventTarget[1] ? `FROM BrowserInteraction SELECT funnel(session, ${selectedList.map((u, idx) => `WHERE targetUrl = '${u.url}' as 'Page ${idx}'`).join(',')})
                      ${(applications.length > 0 && applications.find(a=>a.checked)) ? ('AND appName in (' + applications.filter(a=>a.checked).map(a=>`'${a.label}'`) + ')') : ''} ${since}`
                        : 'Please select URL'
                    }
                    fullHeight
                    fullWidth
                  />
                    </CardBody>
                  </Card>
                </GridItem>
              </Grid>
            </>
          );
        }}
      </PlatformStateContext.Consumer>
    );
  }
}
class UserAccessPoint {
  constructor(url) {
    this.url = url;
    this.parent = {node: null, point: 0};
    this.parents = [];
    this.firstChild = null;
    this.childlen = {};
    this.shown = false;
    this.selected = false;
    this.shownRoots = {};
  }

  showChildlen(root) {
    this.shown = true;
    this.shownRoots[root] = true;
    Object.values(this.childlen).map(c=>c.node).filter(c=>!c.shown).forEach(c=>c.showChildlen(root));
  }

  removeRoot(root) {
    if (!this.shownRoots[root]) return;
    delete this.shownRoots[root];
    this.shown = Object.keys(this.shownRoots).length > 0;
    Object.values(this.childlen).map(c=>c.node).filter(c=>c.shown).forEach(c=>c.removeRoot(root));
  }
  shownClear() {
    this.shown = false;
    Object.values(this.childlen).map(c=>c.node).filter(c=>c.shown).forEach(c=>c.shownClear());
  }

}
