import { Injectable, inject } from '@angular/core';
import { Firestore, doc, setDoc, getDoc, collection, query, where, getDocs } from '@angular/fire/firestore';
import { Organization } from '../models/organization.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OrganizationService {
  private firestore = inject(Firestore);

  /**
   * オブジェクトからundefined値を再帰的に削除するヘルパー関数
   */
  private removeUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefinedValues(item));
    }
    
    if (typeof obj === 'object') {
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
   * 組織情報を作成
   */
  async createOrganization(organization: Omit<Organization, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const orgRef = doc(collection(this.firestore, `${environment.firestorePrefix}organizations`));
    const now = new Date();
    
    // undefinedの値を削除してFirestoreに保存
    const addressData: any = {
      prefecture: organization.address.prefecture,
      city: organization.address.city,
      street: organization.address.street
    };
    
    // address.postalCodeがundefinedでない場合のみ追加
    if (organization.address.postalCode !== undefined) {
      addressData.postalCode = organization.address.postalCode;
    }
    
    // address.buildingがundefinedでない場合のみ追加
    if (organization.address.building !== undefined) {
      addressData.building = organization.address.building;
    }

    const orgData: any = {
      name: organization.name,
      address: addressData,
      setupCompleted: false,
      createdAt: now,
      updatedAt: now
    };

    // undefinedでない値のみ追加
    if (organization.corporateNumber !== undefined) {
      orgData.corporateNumber = organization.corporateNumber;
    }
    if (organization.officeNumber !== undefined) {
      orgData.officeNumber = organization.officeNumber;
    }
    if (organization.phoneNumber !== undefined) {
      orgData.phoneNumber = organization.phoneNumber;
    }
    if (organization.email !== undefined) {
      orgData.email = organization.email;
    }
    if (organization.industry !== undefined) {
      orgData.industry = organization.industry;
    }
    if (organization.logoUrl !== undefined) {
      orgData.logoUrl = organization.logoUrl;
    }
    if (organization.insuranceSettings !== undefined) {
      // insuranceSettings内のundefined値を削除
      orgData.insuranceSettings = this.removeUndefinedValues(organization.insuranceSettings);
    }

    await setDoc(orgRef, orgData);

    return orgRef.id;
  }

  /**
   * 組織情報を更新
   */
  async updateOrganization(orgId: string, updates: Partial<Organization>): Promise<void> {
    const orgRef = doc(this.firestore, `${environment.firestorePrefix}organizations`, orgId);
    
    // undefinedのフィールドを除外して更新
    const updateData: any = {
      updatedAt: new Date()
    };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.corporateNumber !== undefined) updateData.corporateNumber = updates.corporateNumber;
    if (updates.officeNumber !== undefined) updateData.officeNumber = updates.officeNumber;
    if (updates.address !== undefined) {
      // addressオブジェクト内のundefinedフィールドを除外
      const addressData: any = {
        prefecture: updates.address.prefecture,
        city: updates.address.city,
        street: updates.address.street
      };
      if (updates.address.postalCode !== undefined) {
        addressData.postalCode = updates.address.postalCode;
      }
      if (updates.address.building !== undefined) {
        addressData.building = updates.address.building;
      }
      updateData.address = addressData;
    }
    if (updates.phoneNumber !== undefined) updateData.phoneNumber = updates.phoneNumber;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.industry !== undefined) updateData.industry = updates.industry;
    if (updates.logoUrl !== undefined) updateData.logoUrl = updates.logoUrl;
    if (updates.payrollDate !== undefined) updateData.payrollDate = updates.payrollDate;
    if (updates.insuranceSettings !== undefined) {
      // insuranceSettings内のundefined値を削除
      updateData.insuranceSettings = this.removeUndefinedValues(updates.insuranceSettings);
    }
    if (updates.applicationFlowSettings !== undefined) {
      // applicationFlowSettings内のundefined値を削除
      updateData.applicationFlowSettings = this.removeUndefinedValues(updates.applicationFlowSettings);
    }
    if (updates.documentSettings !== undefined) {
      // documentSettings内のundefined値を削除
      updateData.documentSettings = this.removeUndefinedValues(updates.documentSettings);
    }
    if (updates.setupCompleted !== undefined) updateData.setupCompleted = updates.setupCompleted;

    await setDoc(orgRef, updateData, { merge: true });
  }

  /**
   * 組織情報を取得
   */
  async getOrganization(orgId: string): Promise<Organization | null> {
    const orgRef = doc(this.firestore, `${environment.firestorePrefix}organizations`, orgId);
    const orgDoc = await getDoc(orgRef);

    if (!orgDoc.exists()) {
      return null;
    }

    const data = orgDoc.data();
    return {
      id: orgDoc.id,
      ...data,
      createdAt: data['createdAt']?.toDate() || new Date(),
      updatedAt: data['updatedAt']?.toDate() || new Date()
    } as Organization;
  }

  /**
   * ユーザーIDから組織情報を取得
   */
  async getOrganizationByUserId(userId: string): Promise<Organization | null> {
    // TODO: ユーザー情報からorganizationIdを取得して組織情報を取得
    // 現在は簡易実装
    return null;
  }
}

