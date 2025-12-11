import { Injectable, inject, Injector } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs, updateDoc, deleteDoc, Timestamp } from '@angular/fire/firestore';
import { Employee } from '../models/employee.model';
import { Application } from '../models/application.model';
import { environment } from '../../../environments/environment';
import { DeadlineCalculationService } from './deadline-calculation.service';
import { NotificationService } from './notification.service';
import { OrganizationService } from './organization.service';
import { ApplicationService } from './application.service';

@Injectable({
  providedIn: 'root'
})
export class EmployeeService {
  private firestore = inject(Firestore);
  private organizationService = inject(OrganizationService);
  private injector = inject(Injector);

  /**
   * オブジェクトから再帰的にundefinedを削除（Firestore用）
   */
  private removeUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefinedValues(item));
    }
    
    if (typeof obj === 'object' && obj.constructor === Object) {
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];
          if (value !== undefined) {
            cleaned[key] = this.removeUndefinedValues(value);
          }
        }
      }
      return cleaned;
    }
    
    return obj;
  }

  /**
   * 社員を作成
   */
  async createEmployee(employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const employeeRef = doc(collection(this.firestore, `${environment.firestorePrefix}employees`));
    const now = new Date();
    
    const employeeData: any = {
      employeeNumber: employee.employeeNumber,
      firstName: employee.firstName,
      lastName: employee.lastName,
      firstNameKana: employee.firstNameKana,
      lastNameKana: employee.lastNameKana,
      email: employee.email,
      departmentId: employee.departmentId,
      joinDate: employee.joinDate,
      birthDate: employee.birthDate,
      status: employee.status,
      organizationId: employee.organizationId,
      createdAt: now,
      updatedAt: now
    };

    // undefinedでない値のみ追加
    if (employee.dependentInfo !== undefined) {
      employeeData.dependentInfo = employee.dependentInfo;
    }
    if (employee.insuranceInfo !== undefined) {
      employeeData.insuranceInfo = employee.insuranceInfo;
    }
    if (employee.otherCompanyInfo !== undefined) {
      employeeData.otherCompanyInfo = employee.otherCompanyInfo;
    }
    if (employee.address !== undefined) {
      employeeData.address = employee.address;
    }
    if (employee.role !== undefined) {
      employeeData.role = employee.role;
    }

    // undefinedを再帰的に削除
    const cleanedData = this.removeUndefinedValues(employeeData);
    await setDoc(employeeRef, cleanedData);

    return employeeRef.id;
  }

  /**
   * 複数の社員を一括作成
   */
  async createEmployees(employees: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<string[]> {
    const promises = employees.map(emp => this.createEmployee(emp));
    return Promise.all(promises);
  }

  /**
   * 社員を更新
   */
  async updateEmployee(employeeId: string, employee: Partial<Employee>): Promise<void> {
    // 更新前の社員データを取得
    const previousEmployee = await this.getEmployee(employeeId);
    
    const employeeRef = doc(this.firestore, `${environment.firestorePrefix}employees`, employeeId);
    const updateData: any = {
      ...employee,
      updatedAt: new Date()
    };

    // id, createdAt, updatedAtを除外
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.updatedAt;

    // undefinedを再帰的に削除
    const cleanedData = this.removeUndefinedValues(updateData);
    await updateDoc(employeeRef, cleanedData);

    // 入社日または退職日が設定された場合、期限設定と即時通知を送信
    if (previousEmployee) {
      const updatedEmployee = await this.getEmployee(employeeId);
      if (updatedEmployee) {
        // 入社日が新規設定または変更された場合
        if (employee.joinDate !== undefined) {
          const previousJoinDate = previousEmployee.joinDate 
            ? (previousEmployee.joinDate instanceof Date ? previousEmployee.joinDate : new Date((previousEmployee.joinDate as any).seconds * 1000))
            : null;
          const newJoinDate = updatedEmployee.joinDate instanceof Date 
            ? updatedEmployee.joinDate 
            : new Date((updatedEmployee.joinDate as any).seconds * 1000);
          
          if (!previousJoinDate || previousJoinDate.getTime() !== newJoinDate.getTime()) {
            await this.setDeadlineAndSendReminderIfNeeded(
              updatedEmployee,
              'INSURANCE_ACQUISITION'
            );
          }
        }

        // 退職日が新規設定または変更された場合
        if (employee.retirementDate !== undefined) {
          const previousRetirementDate = previousEmployee.retirementDate 
            ? (previousEmployee.retirementDate instanceof Date ? previousEmployee.retirementDate : new Date((previousEmployee.retirementDate as any).seconds * 1000))
            : null;
          const newRetirementDate = updatedEmployee.retirementDate instanceof Date 
            ? updatedEmployee.retirementDate 
            : (updatedEmployee.retirementDate ? new Date((updatedEmployee.retirementDate as any).seconds * 1000) : null);
          
          if (!previousRetirementDate || (newRetirementDate && previousRetirementDate.getTime() !== newRetirementDate.getTime())) {
            if (newRetirementDate) {
              await this.setDeadlineAndSendReminderIfNeeded(
                updatedEmployee,
                'INSURANCE_LOSS'
              );
            }
          }
        }
      }
    }
  }

  /**
   * 期限設定と即時通知を送信（該当社員の外部申請が送信されていない場合のみ）
   */
  private async setDeadlineAndSendReminderIfNeeded(
    employee: Employee,
    applicationTypeCode: string
  ): Promise<void> {
    if (!employee.organizationId || !employee.id) {
      return;
    }

    // 組織情報を取得
    const organization = await this.organizationService.getOrganization(employee.organizationId);
    if (!organization?.applicationFlowSettings?.applicationTypes) {
      return;
    }

    // 申請種別を取得
    const applicationType = organization.applicationFlowSettings.applicationTypes.find(
      type => type.code === applicationTypeCode && type.category === 'external'
    );
    if (!applicationType) {
      return;
    }

    // 該当社員の外部申請が既に送信されているかチェック
    const applicationService = this.injector.get(ApplicationService);
    const externalApplications = await applicationService.getApplicationsByOrganization(employee.organizationId, {
      employeeId: employee.id,
      category: 'external'
    });

    const hasSentApplication = externalApplications.some(app => 
      app.type === applicationType.id &&
      app.externalApplicationStatus === 'sent'
    );

    if (hasSentApplication) {
      return; // 既に送信されている場合は通知しない
    }

    // 仮想的な申請データを作成して期限を計算
    const virtualApplication: Application = {
      id: undefined,
      type: applicationType.id,
      category: 'external',
      employeeId: employee.id,
      organizationId: employee.organizationId,
      status: 'pending',
      data: {},
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 循環依存を避けるため、メソッド内で遅延注入
    const deadlineCalculationService = this.injector.get(DeadlineCalculationService);
    const deadline = await deadlineCalculationService.calculateLegalDeadline(
      virtualApplication,
      applicationType
    );

    if (deadline) {
      // 即時通知を送信（事前通知のリマインダー日を過ぎている場合）
      // 循環依存を避けるため、メソッド内で遅延注入
      const notificationService = this.injector.get(NotificationService);
      await notificationService.sendImmediateDeadlineReminderIfNeeded(
        employee.organizationId,
        employee.id,
        applicationTypeCode,
        deadline,
        false // 法定期限
      );
    }
  }

  /**
   * 社員を取得
   */
  async getEmployee(employeeId: string): Promise<Employee | null> {
    const employeeRef = doc(this.firestore, `${environment.firestorePrefix}employees`, employeeId);
    const employeeSnap = await getDoc(employeeRef);

    if (!employeeSnap.exists()) {
      return null;
    }

    const data = employeeSnap.data();
    return this.convertToEmployee(data, employeeId);
  }

  /**
   * 組織の全社員を取得
   */
  async getEmployeesByOrganization(organizationId: string): Promise<Employee[]> {
    const employeesRef = collection(this.firestore, `${environment.firestorePrefix}employees`);
    const q = query(employeesRef, where('organizationId', '==', organizationId));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => this.convertToEmployee(doc.data(), doc.id));
  }

  /**
   * 部署の社員を取得
   */
  async getEmployeesByDepartment(departmentId: string): Promise<Employee[]> {
    const employeesRef = collection(this.firestore, `${environment.firestorePrefix}employees`);
    const q = query(employeesRef, where('departmentId', '==', departmentId));
    const querySnapshot = await getDocs(q);

    return querySnapshot.docs.map(doc => this.convertToEmployee(doc.data(), doc.id));
  }

  /**
   * 社員を削除
   */
  async deleteEmployee(employeeId: string): Promise<void> {
    const employeeRef = doc(this.firestore, `${environment.firestorePrefix}employees`, employeeId);
    await deleteDoc(employeeRef);
  }

  /**
   * メールアドレスで社員を検索（organizationIdなし）
   */
  async getEmployeeByEmail(email: string): Promise<Employee | null> {
    const employeesRef = collection(this.firestore, `${environment.firestorePrefix}employees`);
    const q = query(employeesRef, where('email', '==', email));
    const snapshot = await getDocs(q);
    
    if (!snapshot.empty) {
      return this.convertToEmployee(snapshot.docs[0].data(), snapshot.docs[0].id);
    }
    
    return null;
  }

  /**
   * 既存社員をチェック（社員番号またはメールアドレスで検索）
   */
  async checkEmployeeExists(employeeNumber: string, email: string, organizationId: string): Promise<Employee | null> {
    const employeesRef = collection(this.firestore, `${environment.firestorePrefix}employees`);
    
    // 社員番号で検索
    const q1 = query(
      employeesRef,
      where('employeeNumber', '==', employeeNumber),
      where('organizationId', '==', organizationId)
    );
    const snapshot1 = await getDocs(q1);
    
    if (!snapshot1.empty) {
      return this.convertToEmployee(snapshot1.docs[0].data(), snapshot1.docs[0].id);
    }
    
    // メールアドレスで検索
    const q2 = query(
      employeesRef,
      where('email', '==', email),
      where('organizationId', '==', organizationId)
    );
    const snapshot2 = await getDocs(q2);
    
    if (!snapshot2.empty) {
      return this.convertToEmployee(snapshot2.docs[0].data(), snapshot2.docs[0].id);
    }
    
    return null;
  }

  /**
   * 識別情報で社員を検索（被保険者整理番号、個人番号、基礎年金番号）
   */
  async getEmployeeByIdentification(
    organizationId: string,
    insuranceNumber?: string,
    personalNumber?: string,
    basicPensionNumber?: string
  ): Promise<Employee | null> {
    const employeesRef = collection(this.firestore, `${environment.firestorePrefix}employees`);
    
    // 組織内の全社員を取得
    const q = query(employeesRef, where('organizationId', '==', organizationId));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      return null;
    }
    
    // 各社員をチェック
    for (const docSnap of snapshot.docs) {
      const employee = this.convertToEmployee(docSnap.data(), docSnap.id);
      
      // 被保険者整理番号で検索
      if (insuranceNumber && employee.insuranceInfo?.healthInsuranceNumber === insuranceNumber) {
        return employee;
      }
      
      // 個人番号で検索
      if (personalNumber && employee.insuranceInfo?.myNumber === personalNumber) {
        return employee;
      }
      
      // 基礎年金番号で検索
      if (basicPensionNumber && employee.insuranceInfo?.pensionNumber === basicPensionNumber) {
        return employee;
      }
    }
    
    return null;
  }

  /**
   * FirestoreのTimestampまたはDateをDateオブジェクトに変換するヘルパー関数
   * Emulatorと本番環境の両方に対応
   */
  private convertToDate(value: any): Date | null {
    if (!value) {
      return null;
    }
    // 既にDateオブジェクトの場合はそのまま返す
    if (value instanceof Date) {
      return value;
    }
    // Timestampオブジェクトの場合はtoDate()を呼び出す
    if (value && typeof value.toDate === 'function') {
      return value.toDate();
    }
    // その他の場合はnullを返す
    return null;
  }

  /**
   * 氏名を分割（後方互換性のため）
   */
  private splitName(name: string, nameKana: string): { firstName: string; lastName: string; firstNameKana: string; lastNameKana: string } {
    // 既にfirstName/lastNameがある場合はそのまま返す
    if (name && name.includes(' ')) {
      const parts = name.split(' ', 2);
      const kanaParts = nameKana ? nameKana.split(' ', 2) : ['', ''];
      return {
        firstName: parts[1] || '',
        lastName: parts[0] || '',
        firstNameKana: kanaParts[1] || '',
        lastNameKana: kanaParts[0] || ''
      };
    }
    
    // nameKanaから推測（カタカナの長さで分割）
    if (nameKana && nameKana.length > 0) {
      // カタカナの長さの半分で分割（簡易的な方法）
      const kanaMid = Math.ceil(nameKana.length / 2);
      const lastNameKana = nameKana.substring(0, kanaMid);
      const firstNameKana = nameKana.substring(kanaMid);
      
      // nameも同様に分割
      const nameMid = Math.ceil(name.length / 2);
      const lastName = name.substring(0, nameMid);
      const firstName = name.substring(nameMid);
      
      return { firstName, lastName, firstNameKana, lastNameKana };
    }
    
    // デフォルト値
    return { firstName: name || '', lastName: '', firstNameKana: nameKana || '', lastNameKana: '' };
  }

  /**
   * FirestoreのデータをEmployeeオブジェクトに変換
   */
  private convertToEmployee(data: any, id: string): Employee {
    // dependentInfoのbirthDateを変換
    let dependentInfo = data['dependentInfo'];
    if (dependentInfo && Array.isArray(dependentInfo)) {
      dependentInfo = dependentInfo.map((dep: any) => ({
        ...dep,
        birthDate: this.convertToDate(dep.birthDate) || dep.birthDate
      }));
    }

    // insuranceInfoのinsuranceStartDateを変換
    let insuranceInfo = data['insuranceInfo'];
    if (insuranceInfo) {
      insuranceInfo = {
        ...insuranceInfo,
        insuranceStartDate: insuranceInfo.insuranceStartDate 
          ? (this.convertToDate(insuranceInfo.insuranceStartDate) || insuranceInfo.insuranceStartDate)
          : insuranceInfo.insuranceStartDate
      };
    }

    // salaryDataの変換処理
    let salaryData = data['salaryData'];
    if (salaryData && Array.isArray(salaryData)) {
      salaryData = salaryData.map((sd: any) => ({
        ...sd,
        createdAt: this.convertToDate(sd.createdAt) || new Date(),
        updatedAt: this.convertToDate(sd.updatedAt) || new Date(),
        confirmedAt: sd.confirmedAt ? (this.convertToDate(sd.confirmedAt) || undefined) : undefined
      }));
    }

    // 後方互換性: name/nameKanaがある場合はfirstName/lastNameに分割
    let firstName = data['firstName'];
    let lastName = data['lastName'];
    let firstNameKana = data['firstNameKana'];
    let lastNameKana = data['lastNameKana'];
    
    if (!firstName && !lastName && data['name']) {
      const nameParts = this.splitName(data['name'], data['nameKana'] || '');
      firstName = nameParts.firstName;
      lastName = nameParts.lastName;
      firstNameKana = nameParts.firstNameKana;
      lastNameKana = nameParts.lastNameKana;
    }

    return {
      id,
      employeeNumber: data['employeeNumber'],
      firstName: firstName || '',
      lastName: lastName || '',
      firstNameKana: firstNameKana || '',
      lastNameKana: lastNameKana || '',
      email: data['email'],
      departmentId: data['departmentId'],
      joinDate: this.convertToDate(data['joinDate']) || data['joinDate'],
      birthDate: this.convertToDate(data['birthDate']) || data['birthDate'],
      status: data['status'],
      dependentInfo: dependentInfo,
      insuranceInfo: insuranceInfo,
      otherCompanyInfo: data['otherCompanyInfo'],
      address: data['address'],
      changeHistory: data['changeHistory'],
      salaryData: salaryData,
      organizationId: data['organizationId'],
      role: data['role'] || 'employee', // デフォルト: 'employee'
      invitationEmailSent: data['invitationEmailSent'],
      emailVerified: data['emailVerified'],
      createdAt: this.convertToDate(data['createdAt']) || new Date(),
      updatedAt: this.convertToDate(data['updatedAt']) || new Date()
    };
  }
}

