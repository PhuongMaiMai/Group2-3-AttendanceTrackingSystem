import { Component, ViewChild } from '@angular/core';
import { Nav, Platform, Events  } from 'ionic-angular';
import { StatusBar } from '@ionic-native/status-bar';
import { SplashScreen } from '@ionic-native/splash-screen';

import { LoginPage } from '../pages/login/login';
import { HomePage } from '../pages/home/home';
import { ListPage } from '../pages/list/list';
import { DetailsView } from '../pages/detail/detail';
import { RestAPI } from "../providers/rest-api";

@Component({
  templateUrl: 'app.html'
})
export class MyApp {
  @ViewChild(Nav) nav: Nav;

  rootPage: any = LoginPage;
  pages: Array<{title: string, icon: string, component: any, textColor: string}>;
  user: {
    "id": number,
    "email": string,
    "name": string,
    "password": string,
    "type": string
  };
  textColor: string;
  group: object;

  constructor(public platform: Platform,
              public statusBar: StatusBar,
              public splashScreen: SplashScreen,
              public events: Events, private restAPI: RestAPI) {

    this.initializeApp();

    events.subscribe('share user data', (response) => {
      this.user = response;
      //Currently we only allow a student to be registered in one tutorial group
      this.restAPI.get('users/' + this.user.id +'/groups').subscribe((response) => {
        this.group = response;
        this.setUpPageMenu();
      });
    });

    this.setUpPageMenu();

  }

  initializeApp() {
    this.platform.ready().then(() => {
      // Okay, so the platform is ready and our plugins are available.
      // Here you can do any higher level native things you might need.
      this.statusBar.styleDefault();
      this.splashScreen.hide();
    });
  }

  /**
   * build the menu items
   */
  setUpPageMenu() {
    this.pages = [
      {title: 'Home', icon: "home", component: HomePage, textColor: 'primary'},
      {title: 'List', icon: "list", component: ListPage, textColor: 'dark'}];

    if(this.group) {
      this.pages.push(
        {title: 'Group details', icon: "book", component: DetailsView, textColor: 'dark'}
      )
    }

    this.pages.push(
      {title: 'Logout', icon: "log-out", component: LoginPage, textColor: 'dark'}
    );
  }

  /**
   *
   * @param {{title: string, icon: string, component: object, textColor: string}} page
   */
  openPage(page) {
    page.textColor = 'primary';
    this.resetOtherTextColors(page);
    this.nav.setRoot(page.component, {
      user: this.user,
      group: this.group
    });
  }

  /**
   * reset colors for menu
   * @param {{title: string, icon: string, component: object, textColor: string}} page
   */
  resetOtherTextColors(page) {
    for(let i = 0; i < this.pages.length; i++) {
      if(this.pages[i].title !== page.title) {
        this.pages[i].textColor = 'dark';
      }
    }
  }

  /**
   * Angular sometimes does not recognize an array of objects of ngFor..
   * only currently implemented
   * @param raw - response from server
   * @returns {[]}
   */
  getArray(raw) {
    return Array.from(raw);
  }
}
